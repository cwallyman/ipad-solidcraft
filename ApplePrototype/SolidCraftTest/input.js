// Fingers navigate; Pencil and mouse retain distinct selection behavior.
window.installSolidcraftInput = (canvas, report) => {
  const fingers = new Map();
  let navigation = null, pencil = null, suspended = false, pendingOrbit = null, uiContact = null, lastTap = null;
  const ORBIT_INTENT_MS = 100;
  const ORBIT_SLOP = 6;
  const debug = {modelTaps:0,alignRequests:0,lastTapGap:0,lastRoute:''};
  window.solidcraftInputDiagnostics = debug;
  let orbitMoves = 0, panMoves = 0, zoomMoves = 0, pencilStrokes = 0;
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const point = event => ({clientX:event.clientX, clientY:event.clientY});
  const emit = (type, p, mode, pressed) => {
    const primary = mode === 'pencil' || mode === 'ui';
    const options = {bubbles:true,cancelable:true,view:window,
      clientX:p.clientX,clientY:p.clientY,button:primary ? 0 : 1,
      buttons:pressed ? (primary ? 1 : 4) : 0,shiftKey:mode === 'orbit',
      pointerType:'mouse',pointerId:primary ? 10001 : 10002,isPrimary:true};
    canvas.dispatchEvent(type === 'mousemove' ? new MouseEvent(type,options) : new PointerEvent(type,options));
  };
  // Keep slight hand tremor from continually restarting egui's tooltip delay.
  // Both UIKit and WebKit pen hover use this one cursor path.
  let hoverPoint = null, hoverReported = false;
  window.solidcraftPencilHover = (x, y, ended) => {
    if (pencil || navigation || uiContact || fingers.size) return;
    if (ended) {
      hoverPoint = null;
      canvas.dispatchEvent(new MouseEvent('mouseleave',{bubbles:true,view:window}));
      return;
    }
    if (!hoverReported) {
      hoverReported = true;
      report({kind:'hover',text:'Pencil hover reached the input bridge.'});
    }
    if (hoverPoint && Math.hypot(x-hoverPoint.clientX,y-hoverPoint.clientY) < 5) return;
    hoverPoint = {clientX:x,clientY:y};
    emit('mousemove',hoverPoint,'pencil',false);
  };
  const releaseNavigation = () => {
    if (navigation) emit('pointerup',navigation.point,navigation.mode,false);
    navigation = null;
  };
  const measure = () => {
    const points = [...fingers.values()];
    if (points.length === 1) return {mode:'orbit',point:points[0],distance:null};
    if (points.length === 2) return {mode:'pan',
      point:{clientX:(points[0].clientX+points[1].clientX)/2,clientY:(points[0].clientY+points[1].clientY)/2},
      distance:Math.hypot(points[0].clientX-points[1].clientX,points[0].clientY-points[1].clientY)};
    return null;
  };
  const startNavigation = initial => {
    releaseNavigation();
    if (suspended || pencil) return;
    navigation = initial || measure();
    if (navigation) {
      emit('mousemove',navigation.point,navigation.mode,false);
      // eframe runs a frame on pointerup/down. Consume the cursor relocation
      // with the button released, so landing/centroid changes cannot rotate or pan.
      emit('pointerup',navigation.point,navigation.mode,false);
      emit('pointerdown',navigation.point,navigation.mode,true);
    }
  };
  const reportNavigation = () => report({kind:'navigation',text:
    `Touch navigation moves: ${orbitMoves+panMoves}; orbit: ${orbitMoves}; pan: ${panMoves}; pinch: ${zoomMoves}; Pencil strokes: ${pencilStrokes}`});
  const modelPoint = p => window.solidcraftIsModelPoint ? window.solidcraftIsModelPoint(p) : true;

  for (const type of ['pointerdown','pointermove','pointerup','pointercancel']) {
    canvas.addEventListener(type,event => {
      // Translated events and the debug harness must reach eframe unchanged.
      if (!event.isTrusted) return;
      if (event.pointerType === 'mouse') {
        if (type === 'pointerdown' && !pencil) {
          hoverPoint = null;
          window.wasmBindings?.touch_set_pencil?.(false);
        }
        return;
      }
      stop(event);
      if (type === 'pointerdown') canvas.focus();
      const p = point(event);
      if (type === 'pointerdown') debug.lastRoute = event.pointerType + ':' + (modelPoint(p) ? 'model' : 'ui');
      if (event.pointerType === 'pen') {
        if (type === 'pointerdown') {
          window.wasmBindings?.touch_set_pencil?.(true);
          if (uiContact) emit('pointerup',uiContact.point,'ui',false);
          uiContact = null; lastTap = null;
          releaseNavigation(); fingers.clear(); suspended = false; pendingOrbit = null;
          hoverPoint = null;
          pencil = {id:event.pointerId,point:p}; pencilStrokes++;
          emit('mousemove',p,'pencil',false);
          emit('pointerdown',p,'pencil',true);
        } else if (type === 'pointermove') {
          if (pencil && pencil.id !== event.pointerId) return;
          if (pencil) {
            pencil.point = p;
            emit('mousemove',p,'pencil',true);
          } else window.solidcraftPencilHover(p.clientX,p.clientY,false);
        } else if (pencil?.id === event.pointerId) {
          emit('pointerup',p,'pencil',false); pencil = null; reportNavigation();
        }
        return;
      }
      if (event.pointerType !== 'touch' || pencil) return;
      if (type === 'pointerdown') window.wasmBindings?.touch_set_pencil?.(false);
      if (uiContact) {
        if (uiContact.id === event.pointerId) {
          if (type === 'pointermove') {
            uiContact.point = p; emit('mousemove',p,'ui',true);
          } else if (type === 'pointerup' || type === 'pointercancel') {
            emit('pointerup',p,'ui',false); uiContact = null;
            if (window.solidcraftReportLayout) window.solidcraftReportLayout();
          }
        }
        return;
      }
      if (type === 'pointerdown' && !modelPoint(p)) {
        releaseNavigation(); fingers.clear(); pendingOrbit = null; lastTap = null; suspended = false;
        uiContact = {id:event.pointerId,point:p};
        emit('mousemove',p,'ui',false);
        emit('pointerup',p,'ui',false);
        emit('pointerdown',p,'ui',true);
        return;
      }
      if (type === 'pointerdown') {
        fingers.set(event.pointerId,p);
        if (fingers.size > 2) suspended = true; // Ignore additional contacts/palms.
        if (fingers.size === 1 && !suspended) {
          // Give a second finger time to land, and ignore resting-finger jitter.
          pendingOrbit = {origin:p,startedAt:event.timeStamp};
        } else {
          pendingOrbit = null;
          lastTap = null;
          startNavigation();
        }
      } else if (type === 'pointermove' && fingers.has(event.pointerId)) {
        fingers.set(event.pointerId,p);
        const next = measure();
        if (pendingOrbit && fingers.size === 1 && !suspended) {
          const distance = Math.hypot(p.clientX-pendingOrbit.origin.clientX,p.clientY-pendingOrbit.origin.clientY);
          if (event.timeStamp-pendingOrbit.startedAt < ORBIT_INTENT_MS || distance < ORBIT_SLOP) return;
          startNavigation({mode:'orbit',point:pendingOrbit.origin,distance:null});
          pendingOrbit = null;
          lastTap = null;
        }
        if (!navigation || !next || suspended) return;
        emit('mousemove',next.point,next.mode,true);
        if (next.mode === 'orbit') orbitMoves++; else panMoves++;
        if (next.mode === 'pan' && navigation.distance > 0 && next.distance > 0) {
          const ratio = next.distance/navigation.distance;
          if (Math.abs(Math.log(ratio)) > 0.0001) {
            canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,
              clientX:next.point.clientX,clientY:next.point.clientY,deltaY:-Math.log(ratio)/0.0015,deltaMode:0}));
            zoomMoves++;
          }
        }
        navigation = next;
      } else if ((type === 'pointerup' || type === 'pointercancel') && fingers.has(event.pointerId)) {
        const tap = type === 'pointerup' && fingers.size === 1 && pendingOrbit
          && event.timeStamp-pendingOrbit.startedAt < 350
          && Math.hypot(p.clientX-pendingOrbit.origin.clientX,p.clientY-pendingOrbit.origin.clientY) < ORBIT_SLOP;
        if (tap) {
          debug.modelTaps++;
          if (lastTap) debug.lastTapGap = event.timeStamp-lastTap.time;
          if (lastTap && event.timeStamp-lastTap.time < 350 && Math.hypot(p.clientX-lastTap.point.clientX,p.clientY-lastTap.point.clientY) < 20) {
            debug.alignRequests++;
            if (window.solidcraftAlignFace) window.solidcraftAlignFace(p);
            lastTap = null;
          } else lastTap = {point:p,time:event.timeStamp};
        } else lastTap = null;
        pendingOrbit = null;
        releaseNavigation(); fingers.delete(event.pointerId);
        // Lifting one finger after panning must not suddenly orbit the model.
        suspended = fingers.size > 0;
        if (!fingers.size) {
          suspended = false; reportNavigation();
          if (window.solidcraftReportLayout) window.solidcraftReportLayout();
        }
      }
    },{capture:true,passive:false});
  }
  canvas.addEventListener('pointerleave',event => {
    if (event.isTrusted && event.pointerType === 'pen' && !pencil) {
      window.solidcraftPencilHover(0,0,true);
    }
  },{capture:true});
  // eframe also subscribes to legacy touch and compatibility mouse events.
  for (const type of ['touchstart','touchmove','touchend','touchcancel','gesturestart','gesturechange','gestureend']) {
    canvas.addEventListener(type,stop,{capture:true,passive:false});
  }
  canvas.addEventListener('mousemove',event => {
    if (event.isTrusted && (navigation || pencil || uiContact || fingers.size || hoverPoint)) stop(event);
  },{capture:true,passive:false});
  canvas.addEventListener('mouseleave',event => {
    if (event.isTrusted && hoverPoint) stop(event);
  },{capture:true,passive:false});
  window.addEventListener('blur',() => {
    releaseNavigation();
    if (pencil) emit('pointerup',pencil.point,'pencil',false);
    if (uiContact) emit('pointerup',uiContact.point,'ui',false);
    hoverPoint = null;
    pencil = null; uiContact = null; fingers.clear(); suspended = false; pendingOrbit = null; lastTap = null;
  });
};

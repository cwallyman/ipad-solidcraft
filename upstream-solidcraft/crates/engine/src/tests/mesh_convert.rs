use super::*;
use solidcraft_doc::{Document, FeatureKind, MeshData};
use solidcraft_geom::Vec3;

fn imported_box() -> Session {
    let body = solidcraft_kernel::box_solid(Vec3::ZERO, Vec3::new(10., 20., 30.)).unwrap();
    let mesh = body.tessellate(0.01).unwrap();
    let mut doc = Document::default();
    doc.add_feature(
        FeatureKind::MeshImport {
            file: "public-safe-box.stl".into(),
            meshes: vec![MeshData {
                name: "Mesh".into(),
                positions: mesh.positions.iter().flat_map(|p| [p.x, p.y, p.z]).collect(),
                triangles: mesh.triangles.iter().flatten().copied().collect(),
                color: Some([0.2, 0.5, 0.8]),
            }],
        },
        Some("Imported mesh"),
    )
    .unwrap();
    Session::new(doc)
}

#[test]
fn mesh_conversion_is_parametric_undoable_and_editable_after_cold_reopen() {
    let mut s = imported_box();
    run(&mut s, "parameters.add", json!({"name":"size","expression":"1","unit":""}));
    run(&mut s, "solid.scale", json!({"bodies":["Mesh"],"factor":"size","name":"Mesh scale"}));
    run(&mut s, "mesh.convert", json!({"body":"Mesh","tolerance":"0.01 mm","name":"Reconstructed prism"}));
    let check = |s: &Session| {
        let state = s.model.state();
        let body = &state.body("Mesh").unwrap().body;
        assert!(!body.is_mesh());
        assert_eq!(body.faces(0.01).unwrap().len(), 6);
        assert_eq!(body.color(), Some([0.2, 0.5, 0.8]));
        assert!(s.model.results.iter().all(|r| r.error.is_none()), "{:?}", s.model.results);
    };
    check(&s);
    assert!((volume(&mut s) - 6000.).abs() < 1e-6);
    run(&mut s, "edit.undo", json!({}));
    assert!(s.model.state().body("Mesh").unwrap().body.is_mesh());
    run(&mut s, "edit.redo", json!({}));
    check(&s);
    run(&mut s, "parameters.change", json!({"name":"size","expression":"2"}));
    check(&s);
    assert!((volume(&mut s) - 48000.).abs() < 1e-5);
    let mut cold = Session::new(Document::from_json(&s.doc.to_json()).unwrap());
    check(&cold);
    assert!((volume(&mut cold) - 48000.).abs() < 1e-5);
    run(&mut cold, "solid.fillet", json!({"body":"Mesh","edges":[[0,20,60]],"radius":2}));
    assert!(volume(&mut cold) < 48000.);
    assert!(cold.model.results.iter().all(|r| r.error.is_none()));
}

#[test]
fn failed_mesh_conversions_leave_the_design_unchanged() {
    let mut s = imported_box();
    let before = s.doc.to_json();
    for params in [
        json!({}),
        json!({"body":"Missing"}),
        json!({"body":"Mesh","tolerance":0}),
        json!({"body":"Mesh","tolerance":"unknown"}),
        json!({"body":"Mesh","tolerance":"2 mm"}),
    ] {
        assert!(s.execute("mesh.convert", &params).is_err());
        assert_eq!(s.doc.to_json(), before);
        assert!(s.model.state().body("Mesh").unwrap().body.is_mesh());
    }
}

#[test]
fn exported_binary_stl_with_a_bore_reconstructs_analytic_faces() {
    let mut s = Session::default();
    run(&mut s, "sketch.create", json!({"plane":"XY","name":"Section"}));
    run(&mut s, "sketch.line", json!({"points":[[0,0],[40,0],[40,20],[20,20],[20,30],[0,30]],"closed":true}));
    run(&mut s, "sketch.circle.center", json!({"center":[10,10],"radius":4}));
    run(&mut s, "sketch.finish", json!({}));
    run(&mut s, "solid.extrude", json!({"sketch":"Section","profiles":[{"point":[30,10]}],"distance":15,"body_name":"Bracket"}));
    let path = std::env::temp_dir().join(format!("solidcraft-mesh-convert-{}.stl", std::process::id()));
    run(&mut s, "file.save_mesh", json!({"path":path}));
    run(&mut s, "doc.open", json!({"path":path}));
    let name = s.model.state().bodies[0].name.clone();
    run(&mut s, "mesh.convert", json!({"body":name,"tolerance":"0.05 mm"}));
    let state = s.model.state();
    let body = &state.bodies[0].body;
    assert!(!body.is_mesh());
    assert!(body.validity().is_empty());
    assert_eq!(solidcraft_kernel::measure(body).unwrap().merged.face_types.get("cylinder"), Some(&1));
    assert_eq!(body.faces(0.01).unwrap().len(), 10);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn faceted_conversion_persists_method_and_supports_undo() {
    let mut s = imported_box();
    run(&mut s, "mesh.convert", json!({"body":"Mesh","method":"faceted"}));
    assert!(!s.model.state().body("Mesh").unwrap().body.is_mesh());
    assert_eq!(s.model.state().body("Mesh").unwrap().body.faces(0.01).unwrap().len(), 6);
    let cold = Session::new(Document::from_json(&s.doc.to_json()).unwrap());
    assert!(!cold.model.state().body("Mesh").unwrap().body.is_mesh());
    assert!(cold.model.results.iter().all(|r| r.error.is_none()));
    run(&mut s, "edit.undo", json!({}));
    assert!(s.model.state().body("Mesh").unwrap().body.is_mesh());
    let before = s.doc.to_json();
    assert!(s.execute("mesh.convert", &json!({"body":"Mesh","method":"unknown"})).is_err());
    assert_eq!(before, s.doc.to_json());
}

#[test]
#[ignore = "local user STL verification; set SOLIDCRAFT_LOCAL_MESH"]
fn local_stl_faceted_conversion_and_step_export() {
    let path = std::env::var("SOLIDCRAFT_LOCAL_MESH").unwrap();
    let mut s = Session::default();
    run(&mut s, "doc.open", json!({"path":path}));
    let name = s.model.state().bodies[0].name.clone();
    run(&mut s, "mesh.convert", json!({"body":name,"method":"faceted"}));
    let check = |s: &Session| {
        let st = s.model.state();
        assert!(st.bodies.iter().all(|b| !b.body.is_mesh() && b.body.validity().is_empty()));
        assert!(s.model.results.iter().all(|r| r.error.is_none()));
        println!(
            "Converted bodies: {}; faces: {}; volume: {}",
            st.bodies.len(),
            st.bodies.iter().map(|b| b.body.faces(0.01).unwrap().len()).sum::<usize>(),
            st.bodies.iter().map(|b| b.body.volume_at(0.01).unwrap()).sum::<f64>()
        );
    };
    check(&s);
    let cold = Session::new(Document::from_json(&s.doc.to_json()).unwrap());
    check(&cold);
    if let Ok(output) = std::env::var("SOLIDCRAFT_LOCAL_STEP_OUTPUT") {
        run(&mut s, "file.export", json!({"path":output,"format":"step"}));
        let step = std::fs::read_to_string(&output).unwrap();
        assert!(!step.contains("BREP_WITH_VOIDS"));
        let imported = solidcraft_kernel::step_import(&step).unwrap();
        assert!(imported.warnings.is_empty(), "{:?}", imported.warnings);
        assert_eq!(imported.bodies.len(), s.model.state().bodies.len());
        assert!(imported.bodies.iter().all(|b| b.body.validity().is_empty()));
    }
}

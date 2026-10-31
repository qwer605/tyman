extends Node3D

const Player = preload("res://scripts/player.gd")
const CRYSTAL_POSITIONS := [
	Vector3(-5, 1.2, 3), Vector3(5, 1.2, 2), Vector3(-4, 1.2, -4),
	Vector3(4, 1.2, -5), Vector3(0, 2.2, -9)
]

var player: CharacterBody3D
var crystals: Array[Area3D] = []
var collected := 0
var score: Label


func _ready() -> void:
	var environment := WorldEnvironment.new()
	var settings := Environment.new()
	settings.background_mode = Environment.BG_COLOR
	settings.background_color = Color("172338")
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("b5d6ef")
	settings.ambient_light_energy = 0.65
	settings.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = settings
	add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -30, 0)
	sun.light_color = Color("ffe6c7")
	sun.light_energy = 1.4
	sun.shadow_enabled = true
	add_child(sun)
	add_box(Vector3(0, -0.5, 0), Vector3(32, 1, 32), Color("344962"))
	for x: float in [-15.5, 15.5]:
		add_box(Vector3(x, 0.15, 0), Vector3(0.15, 0.3, 31), Color("35dcc5"))
	for z: float in [-15.5, 15.5]:
		add_box(Vector3(0, 0.15, z), Vector3(31, 0.3, 0.15), Color("35dcc5"))
	add_box(Vector3(-7, 0.5, -1), Vector3(3, 1, 3), Color("ed9b57"))
	add_box(Vector3(7, 0.75, -5), Vector3(2, 1.5, 3), Color("ed9b57"))
	add_box(Vector3(0, 0.5, -9), Vector3(5, 1, 3), Color("607bba"))
	player = Player.new()
	add_child(player)
	for crystal_position: Vector3 in CRYSTAL_POSITIONS:
		add_crystal(crystal_position)
	var hud := CanvasLayer.new()
	add_child(hud)
	var title := Label.new()
	title.text = "TYMAN / 3D PLAYGROUND"
	title.position = Vector2(28, 22)
	title.add_theme_font_size_override("font_size", 26)
	hud.add_child(title)
	score = Label.new()
	score.position = Vector2(28, 62)
	score.add_theme_color_override("font_color", Color("35dcc5"))
	hud.add_child(score)
	update_score()
	var help := Label.new()
	help.text = "WASD  Move    SPACE  Jump    MOUSE  Look    R  Respawn    ESC  Release mouse"
	help.position = Vector2(28, 98)
	help.add_theme_font_size_override("font_size", 16)
	hud.add_child(help)


func add_box(location: Vector3, size: Vector3, color: Color) -> void:
	var body := StaticBody3D.new()
	body.position = location
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	body.add_child(collision)
	var visual := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	visual.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.85
	visual.material_override = material
	body.add_child(visual)
	add_child(body)


func add_crystal(location: Vector3) -> void:
	var crystal := Area3D.new()
	crystal.position = location
	crystal.collision_layer = 0
	crystal.collision_mask = 1
	var collision := CollisionShape3D.new()
	var shape := SphereShape3D.new()
	shape.radius = 0.65
	collision.shape = shape
	crystal.add_child(collision)
	var visual := MeshInstance3D.new()
	var mesh := PrismMesh.new()
	mesh.size = Vector3(0.6, 0.9, 0.6)
	visual.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("ffd166")
	material.emission_enabled = true
	material.emission = Color("ffb938")
	material.emission_energy_multiplier = 0.8
	visual.material_override = material
	crystal.add_child(visual)
	crystal.body_entered.connect(func(body: Node3D) -> void:
		if body == player and not crystal.is_queued_for_deletion():
			collected += 1
			crystal.queue_free()
			update_score()
	)
	crystals.append(crystal)
	add_child(crystal)


func _process(delta: float) -> void:
	for crystal: Area3D in crystals:
		if is_instance_valid(crystal):
			crystal.rotate_y(delta * 1.5)


func update_score() -> void:
	score.text = "CRYSTALS  %d / %d" % [collected, CRYSTAL_POSITIONS.size()]
	if collected == CRYSTAL_POSITIONS.size():
		score.text += "   —   ALL COLLECTED!"

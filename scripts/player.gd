extends CharacterBody3D

const SPEED := 6.0
const JUMP_SPEED := 8.0
const MOUSE_SENSITIVITY := 0.003
const SPAWN := Vector3(0, 2, 6)

var camera_pivot: Node3D
var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")


func _ready() -> void:
	name = "Player"
	position = SPAWN
	for binding: Array in [
		["move_forward", KEY_W], ["move_back", KEY_S],
		["move_left", KEY_A], ["move_right", KEY_D], ["jump", KEY_SPACE]
	]:
		if not InputMap.has_action(binding[0]):
			InputMap.add_action(binding[0])
			var key := InputEventKey.new()
			key.physical_keycode = binding[1]
			InputMap.action_add_event(binding[0], key)
	var collision := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.35
	capsule.height = 1.6
	collision.shape = capsule
	collision.position.y = 0.8
	add_child(collision)
	var visual := MeshInstance3D.new()
	var mesh := CapsuleMesh.new()
	mesh.radius = 0.35
	mesh.height = 1.6
	visual.mesh = mesh
	visual.position.y = 0.8
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("35dcc5")
	material.metallic = 0.2
	material.roughness = 0.4
	visual.material_override = material
	add_child(visual)
	camera_pivot = Node3D.new()
	camera_pivot.position.y = 1.3
	camera_pivot.rotation.x = -0.25
	add_child(camera_pivot)
	var arm := SpringArm3D.new()
	arm.spring_length = 4.5
	arm.margin = 0.2
	arm.add_excluded_object(get_rid())
	camera_pivot.add_child(arm)
	var camera := Camera3D.new()
	camera.current = true
	camera.fov = 75.0
	arm.add_child(camera)
	if DisplayServer.get_name() != "headless":
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		camera_pivot.rotate_y(-event.relative.x * MOUSE_SENSITIVITY)
		camera_pivot.rotation.x = clampf(
			camera_pivot.rotation.x - event.relative.y * MOUSE_SENSITIVITY, -1.0, 0.45
		)
	if event is InputEventKey and event.pressed:
		if event.physical_keycode == KEY_ESCAPE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		if event.physical_keycode == KEY_R:
			respawn()
	if event is InputEventMouseButton and event.pressed:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravity * delta
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = JUMP_SPEED
	var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var direction := camera_pivot.global_basis * Vector3(input.x, 0, input.y)
	direction.y = 0
	direction = direction.normalized()
	velocity.x = direction.x * SPEED
	velocity.z = direction.z * SPEED
	move_and_slide()
	if global_position.y < -15.0:
		respawn()


func respawn() -> void:
	global_position = SPAWN
	velocity = Vector3.ZERO

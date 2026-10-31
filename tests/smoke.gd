extends SceneTree


func _initialize() -> void:
	call_deferred("run_tests")


func check(condition: bool, message: String) -> void:
	if not condition:
		push_error(message)
		quit(1)
		# Stop execution before a later quit(0) can hide this failure.
		assert(condition, message)


func frames(count: int) -> void:
	for index: int in count:
		await physics_frame


func run_tests() -> void:
	var world: Node3D = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await frames(90)
	var player: CharacterBody3D = world.player
	check(player.is_on_floor(), "Player must land on the arena floor")
	var start := player.global_position
	Input.action_press("move_forward")
	await frames(30)
	Input.action_release("move_forward")
	check(player.global_position.z < start.z - 1.0, "W must move the player forward")
	var floor_height := player.global_position.y
	Input.action_press("jump")
	await frames(5)
	Input.action_release("jump")
	check(player.global_position.y > floor_height + 0.2, "Space must make the player jump")
	player.global_position = Vector3(-5, 0.1, 3)
	player.velocity = Vector3.ZERO
	await frames(10)
	check(world.collected == 1, "Entering a crystal must collect it exactly once")
	player.global_position.y = -25
	await frames(5)
	check(player.global_position.y > 0, "Falling off the arena must respawn the player")
	print("PASS: landing, movement, jump, pickup, respawn")
	world.queue_free()
	await process_frame
	quit(0)

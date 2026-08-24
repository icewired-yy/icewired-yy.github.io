"use strict";

const light_field_canvas = document.querySelector("#light-field");
const light_field_context = light_field_canvas
  ? light_field_canvas.getContext("2d", { alpha: true })
  : null;
const sword_image = document.querySelector("#sword-asset");
const reduced_motion_query = window.matchMedia("(prefers-reduced-motion: reduce)");
const bamboo_leaves = [];
const maximum_bamboo_leaf_count = 9;
const maximum_sword_wheel_count = 16;
const maximum_sword_trail_count = 6;
const sword_guard_anchor_ratio = 0.255;
const sword_source_crop = Object.freeze({ x: 368, y: 7, width: 220, height: 1652 });
const sword_trail_opacity_levels = Object.freeze([0.98, 0.82, 0.68, 0.54, 0.41, 0.3]);
const sword_trail_scale_levels = Object.freeze([1, 0.97, 0.94, 0.91, 0.88, 0.85]);
const sword_trail_path_sample_step = 4;
const maximum_sword_trail_path_length = 760;
const maximum_sword_trail_path_sample_count = 768;
const sword_trail_tangent_window = 8;
const sword_trail_minimum_spacing_scale = (
  sword_guard_anchor_ratio * sword_trail_scale_levels[0]
  + (1 - sword_guard_anchor_ratio) * sword_trail_scale_levels[1]
  + 0.13
);
const sword_wheel_slot_step = Math.PI * 2 / maximum_sword_wheel_count;
const sword_formation_arrival_interval = 0.2244;
const sword_formation_angular_speed = (
  sword_wheel_slot_step / sword_formation_arrival_interval
);
const sword_formation_deceleration_duration = 0.36;
const sword_formation_hidden_stage_steps = 1.6;
const sword_formation_reveal_duration = 0.18;
const sword_extraction_stagger_interval = 0.075;
const sword_extraction_blend_duration = 0.4;
const sword_extraction_total_duration = 0.85;
const sword_extraction_position_response = 13;
const sword_entities = Array.from({ length: maximum_sword_wheel_count }, (_, sword_index) => ({
  id: sword_index,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 0,
  height_scale: 0.9,
  slot_index: sword_index,
  formation_index: sword_index,
  formation_offset_x: 0,
  formation_offset_y: 0,
  formation_rotation_offset: 0,
}));
const sword_trail_entity_indices = Array.from(
  { length: maximum_sword_trail_count },
  (_, sword_index) => sword_index,
);
const sword_formation_entity_indices = Array.from(
  { length: maximum_sword_wheel_count },
  (_, sword_index) => sword_index,
);
const sword_trail_path_samples = [];
const sword_trail_pair_spacings = Array.from(
  { length: maximum_sword_trail_count - 1 },
  () => 0,
);
const sword_trail_arc_distances = Array.from(
  { length: maximum_sword_trail_count },
  () => 0,
);
const sword_trail_target_samples = Array.from(
  { length: maximum_sword_trail_count },
  () => ({ x: 0, y: 0, rotation: 0, arc_distance: 0, path_distance: 0 }),
);

let light_field_width = 0;
let light_field_height = 0;
let light_field_pixel_ratio = 1;
let light_field_pointer_x = 0.52;
let light_field_pointer_y = 0.46;
let light_field_target_x = 0.52;
let light_field_target_y = 0.46;
let light_field_animation_frame = 0;
let light_field_pointer_active = false;
let bamboo_leaf_spawn_elapsed = 0;
let bamboo_leaf_previous_timestamp = 0;
let sword_pointer_x = 0;
let sword_pointer_y = 0;
let sword_pointer_initialized = false;
let sword_pointer_event_timestamp = 0;
let sword_pointer_velocity_x = 0;
let sword_pointer_velocity_y = 0;
let sword_pointer_speed = 0;
let sword_seconds_since_motion = Number.POSITIVE_INFINITY;
let sword_trail_rotation = 0;
let sword_trail_spacing = 0;
let sword_mode = "dormant";
let sword_formation_elapsed = 0;
let sword_formation_entry_angle = -Math.PI / 2;
let sword_formation_procession_spacing = 0;
let sword_trail_transition_elapsed = 1;
let sword_wheel_rotation = -Math.PI / 2;
let sword_wheel_center_x = 0;
let sword_wheel_center_y = 0;
let sword_breakout_sample_count = 0;
let sword_breakout_leader_index = -1;

/**
 * Clamp a finite number to an inclusive numeric interval.
 *
 * @param {number} value - Finite number to constrain. `NaN` and infinities are
 *   not supported because they would propagate through the canvas geometry.
 * @param {number} minimum - Inclusive lower bound. Must be less than or equal
 *   to `maximum`.
 * @param {number} maximum - Inclusive upper bound. Must be greater than or
 *   equal to `minimum`.
 * @returns {number} The input value when it is inside the interval, otherwise
 *   the nearest bound.
 * @throws {Error} This helper does not throw intentionally; callers are
 *   responsible for passing an ordered, finite interval.
 * @example
 * const normalized_value = _clamp(1.2, 0, 1); // 1
 */
function _clamp(value, minimum, maximum) {
  // Bound the value in one expression so callers can use it in pointer math.
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Move a scalar toward a target with frame-rate-independent exponential damping.
 *
 * @param {number} current_value - Current finite scalar value.
 * @param {number} target_value - Desired finite scalar value.
 * @param {number} response - Positive response rate in inverse seconds. Higher
 *   values converge more quickly; non-positive values leave the input unchanged.
 * @param {number} delta_seconds - Non-negative elapsed time in seconds.
 * @returns {number} The damped value for the current frame.
 * @throws {Error} This helper does not throw intentionally. Callers must pass
 *   finite values and a non-negative frame duration.
 * @example
 * const next_value = _damp_value(0, 1, 12, 1 / 60);
 */
function _damp_value(current_value, target_value, response, delta_seconds) {
  // Preserve the current value when no positive response or time is available.
  if (response <= 0 || delta_seconds <= 0) {
    return current_value;
  }

  // Convert the response rate into a frame-independent interpolation fraction.
  const response_blend = 1 - Math.exp(-response * delta_seconds);
  return current_value + (target_value - current_value) * response_blend;
}

/**
 * Move an angle toward a target through the shortest circular arc.
 *
 * @param {number} current_angle - Current finite angle in radians.
 * @param {number} target_angle - Desired finite angle in radians. Values need
 *   not be normalized to a particular revolution.
 * @param {number} response - Positive response rate in inverse seconds.
 * @param {number} delta_seconds - Non-negative elapsed time in seconds.
 * @returns {number} The unwrapped damped angle nearest to `current_angle`.
 * @throws {Error} This helper does not throw intentionally. Invalid numeric
 *   inputs propagate through the trigonometric calculation.
 * @example
 * const next_angle = _damp_angle(3.1, -3.1, 16, 1 / 60);
 */
function _damp_angle(current_angle, target_angle, response, delta_seconds) {
  // Resolve the signed shortest arc so crossing ±π never causes a full turn.
  const angle_difference = Math.atan2(
    Math.sin(target_angle - current_angle),
    Math.cos(target_angle - current_angle),
  );
  return _damp_value(current_angle, current_angle + angle_difference, response, delta_seconds);
}

/**
 * Ease a normalized transition with zero slope at both endpoints.
 *
 * @param {number} progress - Transition progress. Values outside `[0, 1]` are
 *   accepted and clamped before easing.
 * @returns {number} Smooth-step progress in the inclusive `[0, 1]` range.
 * @throws {Error} This helper does not throw intentionally; `NaN` propagates.
 * @example
 * const eased_half = _smoothstep(0.5); // 0.5
 */
function _smoothstep(progress) {
  // Clamp before applying the cubic curve so interruptions remain bounded.
  const bounded_progress = _clamp(progress, 0, 1);
  return bounded_progress * bounded_progress * (3 - 2 * bounded_progress);
}

/**
 * Calculate the shortest safe guard-to-guard arc spacing for one adjacent pair.
 *
 * @param {number} base_height - Positive rendered height of the leading sword
 *   before its per-slot scale is applied, measured in CSS pixels.
 * @param {number} pair_index - Zero-based pair index in the inclusive range
 *   `[0, 4]`. Pair `0` separates trail swords zero and one.
 * @returns {number} Minimum center-anchor separation along the recorded path in
 *   CSS pixels. The value includes both asymmetric sprite extents and a visible
 *   gap equal to thirteen percent of the base sword height.
 * @throws {Error} This helper does not throw intentionally. Callers must pass a
 *   valid pair index and a finite non-negative height.
 * @example
 * const safe_gap = _get_sword_pair_minimum_spacing(60, 0);
 */
function _get_sword_pair_minimum_spacing(base_height, pair_index) {
  // Combine the leading handle and following blade extents around their guard anchors.
  const leading_scale = sword_trail_scale_levels[pair_index];
  const following_scale = sword_trail_scale_levels[pair_index + 1];
  return base_height * (
    sword_guard_anchor_ratio * leading_scale
    + (1 - sword_guard_anchor_ratio) * following_scale
    + 0.13
  );
}

/**
 * Resolve the visible leader guide point just outside the future sword wheel.
 *
 * @param {number} pointer_x - Finite canvas-local pointer x coordinate in CSS
 *   pixels. Values at the viewport edge are supported.
 * @param {number} pointer_y - Finite canvas-local pointer y coordinate in CSS
 *   pixels. Values at the viewport edge are supported.
 * @param {number} wheel_radius - Positive future wheel radius in CSS pixels.
 * @returns {{x: number, y: number}} The point followed by the first sword's
 *   guard, offset `0.92 * wheel_radius` along the filtered travel direction.
 * @throws {Error} This helper does not throw intentionally. Invalid numeric
 *   input propagates into the returned coordinates.
 * @example
 * const guide = _get_sword_trail_guide_point(640, 360, 30);
 */
function _get_sword_trail_guide_point(pointer_x, pointer_y, wheel_radius) {
  // Convert the sword's vertical-axis rotation back into its forward travel vector.
  const forward_x = -Math.sin(sword_trail_rotation);
  const forward_y = Math.cos(sword_trail_rotation);
  return {
    x: pointer_x + forward_x * wheel_radius * 0.92,
    y: pointer_y + forward_y * wheel_radius * 0.92,
  };
}

/**
 * Interpolate one point at an absolute cumulative distance on the trail path.
 *
 * @param {number} path_distance - Absolute cumulative arc distance in CSS
 *   pixels. Values outside the retained history are clamped to its endpoints.
 * @returns {{x: number, y: number}} Interpolated canvas-local point. When no
 *   path exists, the current pointer position is returned as a safe fallback.
 * @throws {Error} This helper does not throw intentionally. Path samples must
 *   remain sorted by their cumulative `distance` member.
 * @example
 * const point = _sample_sword_trail_position(120);
 */
function _sample_sword_trail_position(path_distance) {
  // Return a stable fallback before the first pointer event has seeded history.
  if (sword_trail_path_samples.length === 0) {
    return { x: sword_pointer_x, y: sword_pointer_y };
  }

  // Clamp the request to retained history before locating its enclosing segment.
  const oldest_sample = sword_trail_path_samples[0];
  const newest_sample = sword_trail_path_samples.at(-1);
  const bounded_distance = _clamp(
    path_distance,
    oldest_sample.distance,
    newest_sample.distance,
  );
  let lower_index = 0;
  let upper_index = sword_trail_path_samples.length - 1;
  while (lower_index < upper_index) {
    const middle_index = Math.floor((lower_index + upper_index) / 2);
    if (sword_trail_path_samples[middle_index].distance < bounded_distance) {
      lower_index = middle_index + 1;
    } else {
      upper_index = middle_index;
    }
  }

  // Interpolate between the bracketing samples without dividing by a zero segment.
  const following_sample = sword_trail_path_samples[lower_index];
  const preceding_sample = sword_trail_path_samples[Math.max(0, lower_index - 1)];
  const segment_length = following_sample.distance - preceding_sample.distance;
  const segment_progress = segment_length > 0.0001
    ? (bounded_distance - preceding_sample.distance) / segment_length
    : 0;
  return {
    x: preceding_sample.x + (following_sample.x - preceding_sample.x) * segment_progress,
    y: preceding_sample.y + (following_sample.y - preceding_sample.y) * segment_progress,
  };
}

/**
 * Sample a follower pose by arc-length lag from the newest leader guide point.
 *
 * @param {number} distance_from_head - Non-negative follower lag in CSS pixels.
 *   Values longer than retained history clamp to the oldest available sample.
 * @returns {{x: number, y: number, rotation: number, arc_distance: number,
 *   path_distance: number}} Position, local tangent rotation, realized lag, and
 *   absolute cumulative path distance for one persistent sword target.
 * @throws {Error} This helper does not throw intentionally. It expects the path
 *   to have been seeded before normal animation updates.
 * @example
 * const follower_pose = _sample_sword_trail_path(180);
 */
function _sample_sword_trail_path(distance_from_head) {
  // Fall back to the pointer-facing pose only during pre-activation diagnostics.
  if (sword_trail_path_samples.length === 0) {
    return {
      x: sword_pointer_x,
      y: sword_pointer_y,
      rotation: sword_trail_rotation,
      arc_distance: 0,
      path_distance: 0,
    };
  }

  // Convert the requested lag into the absolute retained-path coordinate.
  const oldest_sample = sword_trail_path_samples[0];
  const newest_sample = sword_trail_path_samples.at(-1);
  const target_path_distance = _clamp(
    newest_sample.distance - Math.max(0, distance_from_head),
    oldest_sample.distance,
    newest_sample.distance,
  );
  const target_position = _sample_sword_trail_position(target_path_distance);

  // Estimate a stable local tangent symmetrically around the target arc position.
  const tangent_start_distance = Math.max(
    oldest_sample.distance,
    target_path_distance - sword_trail_tangent_window,
  );
  const tangent_end_distance = Math.min(
    newest_sample.distance,
    target_path_distance + sword_trail_tangent_window,
  );
  const tangent_start = _sample_sword_trail_position(tangent_start_distance);
  const tangent_end = _sample_sword_trail_position(tangent_end_distance);
  const tangent_x = tangent_end.x - tangent_start.x;
  const tangent_y = tangent_end.y - tangent_start.y;
  const tangent_length = Math.hypot(tangent_x, tangent_y);
  const target_rotation = tangent_length > 0.001
    ? Math.atan2(tangent_y, tangent_x) - Math.PI / 2
    : sword_trail_rotation;
  return {
    x: target_position.x,
    y: target_position.y,
    rotation: target_rotation,
    arc_distance: newest_sample.distance - target_path_distance,
    path_distance: target_path_distance,
  };
}

/**
 * Seed a backward synthetic history so all six swords start separated and visible.
 *
 * @param {number} pointer_x - Initial canvas-local pointer x coordinate in CSS pixels.
 * @param {number} pointer_y - Initial canvas-local pointer y coordinate in CSS pixels.
 * @param {number} wheel_radius - Positive future wheel radius in CSS pixels.
 * @param {number} event_timestamp - Initial event time in milliseconds. Missing
 *   or non-finite values are stored as zero because timing is diagnostic only.
 * @returns {void} The function returns no value. It replaces path history and
 *   initializes pair-spacing and target diagnostics for the current viewport.
 * @throws {Error} This helper does not throw intentionally. It requires finite
 *   pointer geometry and a positive radius.
 * @example
 * _seed_sword_trail_path(640, 360, 30, performance.now());
 *
 * @sideEffects Replaces retained path samples and mutates trail diagnostics.
 */
function _seed_sword_trail_path(pointer_x, pointer_y, wheel_radius, event_timestamp) {
  // Build a full-length straight history ending at the visible leader guide point.
  sword_trail_path_samples.splice(0, sword_trail_path_samples.length);
  const guide_point = _get_sword_trail_guide_point(pointer_x, pointer_y, wheel_radius);
  const forward_x = -Math.sin(sword_trail_rotation);
  const forward_y = Math.cos(sword_trail_rotation);
  const sample_count = Math.ceil(
    maximum_sword_trail_path_length / sword_trail_path_sample_step,
  );
  const retained_timestamp = Number.isFinite(event_timestamp) ? event_timestamp : 0;
  for (let sample_index = 0; sample_index <= sample_count; sample_index += 1) {
    const path_distance = (
      maximum_sword_trail_path_length * sample_index / sample_count
    );
    const distance_behind_guide = maximum_sword_trail_path_length - path_distance;
    sword_trail_path_samples.push({
      x: guide_point.x - forward_x * distance_behind_guide,
      y: guide_point.y - forward_y * distance_behind_guide,
      distance: path_distance,
      timestamp: retained_timestamp,
    });
  }

  // Initialize pair-specific gaps and their prefix arc lags at minimum speed.
  const base_height = wheel_radius * 2;
  sword_trail_arc_distances[0] = 0;
  for (let pair_index = 0; pair_index < sword_trail_pair_spacings.length; pair_index += 1) {
    const minimum_spacing = _get_sword_pair_minimum_spacing(base_height, pair_index);
    sword_trail_pair_spacings[pair_index] = minimum_spacing;
    sword_trail_arc_distances[pair_index + 1] = (
      sword_trail_arc_distances[pair_index] + minimum_spacing
    );
  }
  sword_trail_spacing = Math.max(...sword_trail_pair_spacings);
}

/**
 * Append the leader guide's travel to the bounded arc-length history.
 *
 * @param {number} pointer_x - Latest canvas-local pointer x coordinate in CSS pixels.
 * @param {number} pointer_y - Latest canvas-local pointer y coordinate in CSS pixels.
 * @param {number} wheel_radius - Positive future wheel radius in CSS pixels.
 * @param {number} event_timestamp - Latest pointer timestamp in milliseconds.
 *   Non-finite values reuse the last stored timestamp.
 * @returns {void} The function returns no value. Long event jumps are subdivided
 *   to roughly four-pixel samples and history is trimmed to both configured caps.
 * @throws {Error} This helper does not throw intentionally. It expects finite
 *   pointer coordinates and monotonically increasing path distance.
 * @example
 * _append_sword_trail_path_sample(680, 360, 30, performance.now());
 *
 * @sideEffects Appends to and trims the shared sword trail path sample array.
 */
function _append_sword_trail_path_sample(pointer_x, pointer_y, wheel_radius, event_timestamp) {
  // Seed history defensively if a caller records motion before normal activation.
  if (sword_trail_path_samples.length === 0) {
    _seed_sword_trail_path(pointer_x, pointer_y, wheel_radius, event_timestamp);
    return;
  }

  // Subdivide the guide displacement so sharp pointer turns retain their shape.
  const guide_point = _get_sword_trail_guide_point(pointer_x, pointer_y, wheel_radius);
  const previous_sample = sword_trail_path_samples.at(-1);
  const travel_x = guide_point.x - previous_sample.x;
  const travel_y = guide_point.y - previous_sample.y;
  const travel_distance = Math.hypot(travel_x, travel_y);
  if (travel_distance < 0.01) {
    return;
  }
  const segment_count = Math.max(1, Math.ceil(travel_distance / sword_trail_path_sample_step));
  const retained_timestamp = Number.isFinite(event_timestamp)
    ? event_timestamp
    : previous_sample.timestamp;
  for (let segment_index = 1; segment_index <= segment_count; segment_index += 1) {
    const segment_progress = segment_index / segment_count;
    sword_trail_path_samples.push({
      x: previous_sample.x + travel_x * segment_progress,
      y: previous_sample.y + travel_y * segment_progress,
      distance: previous_sample.distance + travel_distance * segment_progress,
      timestamp: (
        previous_sample.timestamp
        + (retained_timestamp - previous_sample.timestamp) * segment_progress
      ),
    });
  }

  // Discard only the oldest samples until both memory and arc-span caps are met.
  const newest_distance = sword_trail_path_samples.at(-1).distance;
  while (
    sword_trail_path_samples.length > 2
    && (
      sword_trail_path_samples.length > maximum_sword_trail_path_sample_count
      || newest_distance - sword_trail_path_samples[0].distance
        > maximum_sword_trail_path_length
    )
  ) {
    sword_trail_path_samples.shift();
  }
}

/**
 * Reset every flying-sword entity and transition to its inactive state.
 *
 * @returns {void} The function returns no value. It clears pointer velocity,
 *   formation/extraction timing, role assignments, and all entity opacity.
 * @throws {Error} This helper does not throw and performs no DOM access.
 * @example
 * _reset_sword_effect();
 *
 * @sideEffects Mutates all shared flying-sword state and entity records.
 */
function _reset_sword_effect() {
  // Clear global state before resetting individual persistent entities.
  sword_pointer_initialized = false;
  sword_pointer_event_timestamp = 0;
  sword_pointer_velocity_x = 0;
  sword_pointer_velocity_y = 0;
  sword_pointer_speed = 0;
  sword_seconds_since_motion = Number.POSITIVE_INFINITY;
  sword_trail_spacing = 0;
  sword_mode = "dormant";
  sword_formation_elapsed = 0;
  sword_formation_entry_angle = -Math.PI / 2;
  sword_formation_procession_spacing = 0;
  sword_trail_transition_elapsed = 1;
  sword_breakout_sample_count = 0;
  sword_breakout_leader_index = -1;
  sword_trail_path_samples.splice(0, sword_trail_path_samples.length);

  // Clear path-derived spacing and target diagnostics before the next activation.
  for (let pair_index = 0; pair_index < sword_trail_pair_spacings.length; pair_index += 1) {
    sword_trail_pair_spacings[pair_index] = 0;
  }
  for (let trail_index = 0; trail_index < maximum_sword_trail_count; trail_index += 1) {
    sword_trail_arc_distances[trail_index] = 0;
    sword_trail_target_samples[trail_index].x = 0;
    sword_trail_target_samples[trail_index].y = 0;
    sword_trail_target_samples[trail_index].rotation = 0;
    sword_trail_target_samples[trail_index].arc_distance = 0;
    sword_trail_target_samples[trail_index].path_distance = 0;
  }

  // Return the stable identity order without discarding the reusable objects.
  for (let trail_index = 0; trail_index < maximum_sword_trail_count; trail_index += 1) {
    sword_trail_entity_indices[trail_index] = trail_index;
  }
  for (const sword_entity of sword_entities) {
    sword_entity.x = 0;
    sword_entity.y = 0;
    sword_entity.rotation = 0;
    sword_entity.opacity = 0;
    sword_entity.height_scale = 0.9;
    sword_entity.slot_index = sword_entity.id;
    sword_entity.formation_index = sword_entity.id;
    sword_entity.formation_offset_x = 0;
    sword_entity.formation_offset_y = 0;
    sword_entity.formation_rotation_offset = 0;
    sword_formation_entity_indices[sword_entity.id] = sword_entity.id;
  }
}

/**
 * Record meaningful fine-pointer travel for sword speed and heading decisions.
 *
 * @param {number} pointer_x - Canvas-local horizontal pointer coordinate in
 *   CSS pixels. Finite values inside the canvas are expected.
 * @param {number} pointer_y - Canvas-local vertical pointer coordinate in CSS
 *   pixels. Finite values inside the canvas are expected.
 * @param {number} event_timestamp - Pointer-event timestamp in milliseconds.
 *   Non-monotonic or missing values fall back to a nominal frame interval.
 * @returns {void} The function returns no value. It initializes or updates the
 *   persistent trail, pointer velocity, idle timer, and travel orientation.
 * @throws {Error} This helper does not throw intentionally. Callers must pass
 *   finite canvas-local coordinates.
 * @example
 * _record_sword_pointer_motion(640, 360, performance.now());
 *
 * @sideEffects Mutates sword pointer, velocity, timing, mode, and entity state.
 */
function _record_sword_pointer_motion(pointer_x, pointer_y, event_timestamp) {
  // Seed a safely spaced trail at the first point without drawing from an old viewport.
  if (!sword_pointer_initialized) {
    sword_pointer_x = pointer_x;
    sword_pointer_y = pointer_y;
    sword_pointer_initialized = true;
    sword_pointer_event_timestamp = Number.isFinite(event_timestamp) ? event_timestamp : 0;
    sword_seconds_since_motion = 0;
    sword_mode = "trailing";
    sword_trail_transition_elapsed = 1;
    sword_wheel_center_x = pointer_x;
    sword_wheel_center_y = pointer_y;

    // Seed a full path and place every visible guard at its exact arc-length lag.
    const initial_metrics = _get_sword_metrics();
    _seed_sword_trail_path(
      pointer_x,
      pointer_y,
      initial_metrics.wheel_radius,
      event_timestamp,
    );
    for (const sword_entity of sword_entities) {
      sword_entity.x = pointer_x;
      sword_entity.y = pointer_y;
      sword_entity.rotation = sword_trail_rotation;
      sword_entity.opacity = 0;
    }
    for (let trail_index = 0;
      trail_index < maximum_sword_trail_count;
      trail_index += 1) {
      const sword_entity = sword_entities[sword_trail_entity_indices[trail_index]];
      const target_sample = _sample_sword_trail_path(
        sword_trail_arc_distances[trail_index],
      );
      Object.assign(sword_trail_target_samples[trail_index], target_sample);
      sword_entity.x = target_sample.x;
      sword_entity.y = target_sample.y;
      sword_entity.rotation = target_sample.rotation;
      sword_entity.height_scale = sword_trail_scale_levels[trail_index];
    }
    return;
  }

  // Ignore sub-pixel hand jitter until it accumulates into deliberate travel.
  const movement_x = pointer_x - sword_pointer_x;
  const movement_y = pointer_y - sword_pointer_y;
  const movement_distance = Math.hypot(movement_x, movement_y);
  if (movement_distance < 1.1) {
    return;
  }

  // Derive a bounded event interval and low-pass velocity for breakout decisions.
  const current_timestamp = Number.isFinite(event_timestamp)
    ? event_timestamp
    : sword_pointer_event_timestamp + 16.67;
  const event_delta_seconds = _clamp(
    (current_timestamp - sword_pointer_event_timestamp) / 1000,
    0.008,
    0.05,
  );
  const instantaneous_velocity_x = movement_x / event_delta_seconds;
  const instantaneous_velocity_y = movement_y / event_delta_seconds;
  const velocity_blend = 1 - Math.exp(-event_delta_seconds / 0.055);
  sword_pointer_velocity_x += (
    instantaneous_velocity_x - sword_pointer_velocity_x
  ) * velocity_blend;
  sword_pointer_velocity_y += (
    instantaneous_velocity_y - sword_pointer_velocity_y
  ) * velocity_blend;
  sword_pointer_speed = Math.hypot(sword_pointer_velocity_x, sword_pointer_velocity_y);

  // Turn toward deliberate travel through the shortest angular path.
  const target_rotation = Math.atan2(movement_y, movement_x) - Math.PI / 2;
  const rotation_difference = Math.atan2(
    Math.sin(target_rotation - sword_trail_rotation),
    Math.cos(target_rotation - sword_trail_rotation),
  );
  const rotation_blend = 1 - Math.exp(-event_delta_seconds / 0.075);
  sword_trail_rotation += rotation_difference * rotation_blend;

  // Mark the accepted position as active motion for the idle-state detector.
  sword_pointer_x = pointer_x;
  sword_pointer_y = pointer_y;
  sword_pointer_event_timestamp = current_timestamp;
  sword_seconds_since_motion = 0;

  // Record the filtered leader guide after heading updates in every active mode.
  const sword_metrics = _get_sword_metrics();
  _append_sword_trail_path_sample(
    pointer_x,
    pointer_y,
    sword_metrics.wheel_radius,
    current_timestamp,
  );
}

/**
 * Resize the light-field canvas to match its CSS box at a bounded pixel ratio.
 *
 * @returns {void} The function returns no value. It updates the canvas bitmap,
 *   drawing transform, cached viewport dimensions, and transient leaf/sword
 *   animation state in place.
 * @throws {Error} No error is raised when the optional canvas or 2D context is
 *   unavailable; the prototype simply continues without the signature effect.
 * @example
 * window.addEventListener("resize", _resize_light_field);
 */
function _resize_light_field() {
  // Leave the static page fully usable when canvas drawing is unavailable.
  if (!light_field_canvas || !light_field_context) {
    return;
  }

  // Measure the rendered canvas and cap density to control memory and fill cost.
  const canvas_bounds = light_field_canvas.getBoundingClientRect();
  light_field_width = Math.max(1, canvas_bounds.width);
  light_field_height = Math.max(1, canvas_bounds.height);
  light_field_pixel_ratio = Math.min(window.devicePixelRatio || 1, 1.5);

  // Allocate the bitmap once at physical-pixel resolution, then draw in CSS pixels.
  light_field_canvas.width = Math.round(light_field_width * light_field_pixel_ratio);
  light_field_canvas.height = Math.round(light_field_height * light_field_pixel_ratio);
  light_field_context.setTransform(
    light_field_pixel_ratio,
    0,
    0,
    light_field_pixel_ratio,
    0,
    0,
  );
  light_field_context.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in light_field_context) {
    light_field_context.imageSmoothingQuality = "high";
  }

  // Discard viewport-relative particles so resizing never makes them jump position.
  bamboo_leaves.length = 0;
  bamboo_leaf_spawn_elapsed = 0;
  bamboo_leaf_previous_timestamp = 0;
  _reset_sword_effect();

  // Repaint the resized resting field even when no continuous loop is active.
  _request_light_field_frame(true);
}

/**
 * Schedule one light-field frame without creating duplicate animation loops.
 *
 * @param {boolean} allow_reduced_motion_frame - When `true`, a single static
 *   frame may be requested for reduced-motion visitors. When `false`, their
 *   canvas remains unchanged. The default is `false`.
 * @returns {void} The function returns no value. A pending frame is preserved,
 *   so repeated pointer events never queue parallel render loops.
 * @throws {Error} This helper does not throw intentionally. It exits when the
 *   canvas is unavailable or motion policy disallows the request.
 * @example
 * _request_light_field_frame();
 *
 * @sideEffects May assign one browser animation-frame identifier to the shared
 *   `light_field_animation_frame` state.
 */
function _request_light_field_frame(allow_reduced_motion_frame = false) {
  // Reject requests that cannot or should not produce a visible canvas frame.
  if (
    !light_field_canvas
    || !light_field_context
    || (reduced_motion_query.matches && !allow_reduced_motion_frame)
  ) {
    return;
  }

  // Preserve the one-loop invariant while a frame is already queued.
  if (light_field_animation_frame !== 0) {
    return;
  }
  light_field_animation_frame = window.requestAnimationFrame(_render_light_field);
}

/**
 * Convert a pointer event into a canvas-local target for the light field.
 *
 * @param {PointerEvent} event - Pointer event from the window. Its `clientX`
 *   and `clientY` coordinates may lie at any position in the viewport. They are
 *   translated into the light-field canvas coordinate system, normalized, and
 *   clamped to the `[0, 1]` interval.
 * @returns {void} The function returns no value. It mutates the target position
 *   used by the next animation frame.
 * @throws {Error} This handler does not throw. Reduced-motion visitors keep the
 *   centered static field and ignore pointer updates.
 * @example
 * window.addEventListener("pointermove", _update_pointer_target);
 */
function _update_pointer_target(event) {
  // Respect the operating-system motion preference before accepting movement.
  if (reduced_motion_query.matches) {
    return;
  }

  // Keep hover-specific sword behavior off coarse touch movement and scrolling.
  if (event.pointerType === "touch") {
    _deactivate_pointer_effects();
    return;
  }

  // Translate viewport coordinates into the canvas box before normalizing them.
  const canvas_bounds = light_field_canvas.getBoundingClientRect();
  const pointer_x = event.clientX - canvas_bounds.left;
  const pointer_y = event.clientY - canvas_bounds.top;

  // Keep the focus on the drawable canvas even when the pointer leaves the page edge.
  light_field_target_x = _clamp(pointer_x / Math.max(1, canvas_bounds.width), 0, 1);
  light_field_target_y = _clamp(pointer_y / Math.max(1, canvas_bounds.height), 0, 1);

  // Feed the exact bounded pointer position to the sword motion detector.
  _record_sword_pointer_motion(
    light_field_target_x * canvas_bounds.width,
    light_field_target_y * canvas_bounds.height,
    event.timeStamp,
  );

  // Seed one leaf promptly when the pointer first activates the ambient effect.
  if (!light_field_pointer_active) {
    bamboo_leaf_spawn_elapsed = 0.38;
  }
  light_field_pointer_active = true;

  // Wake the resting canvas on the first fine-pointer movement.
  _request_light_field_frame();
}

/**
 * Deactivate ambient pointer effects after the pointer leaves the document.
 *
 * @returns {void} The function returns no value. Existing leaves complete their
 *   short fall while new leaves and swords remain inactive until the next move.
 * @throws {Error} This handler does not throw and performs no DOM access.
 * @example
 * document.documentElement.addEventListener("pointerleave", _deactivate_pointer_effects);
 *
 * @sideEffects Mutates leaf-emission state and flying-sword activity state.
 */
function _deactivate_pointer_effects() {
  // Stop future spawning without abruptly removing effects already fading out.
  light_field_pointer_active = false;
  bamboo_leaf_spawn_elapsed = 0;
  _reset_sword_effect();
}

/**
 * Draw a nested elliptical light-field lobe around one optical focus.
 *
 * @param {CanvasRenderingContext2D} context - Active 2D canvas context. It must
 *   already be scaled to CSS pixels and support ellipse strokes.
 * @param {number} center_x - Horizontal focus position in CSS pixels.
 * @param {number} center_y - Vertical focus position in CSS pixels.
 * @param {number} radius - Base radius in CSS pixels. Values below `1` are
 *   technically valid but produce an imperceptible lobe.
 * @param {number} rotation - Ellipse rotation in radians. Any finite value is
 *   accepted and wraps naturally through the canvas API.
 * @returns {void} The function returns no value and draws translucent strokes
 *   into the supplied context.
 * @throws {Error} This function does not validate the context; passing an
 *   incompatible object will surface the browser's native canvas error.
 * @example
 * _draw_interference_lobe(context, 420, 260, 180, 0.25);
 */
function _draw_interference_lobe(context, center_x, center_y, radius, rotation) {
  // Isolate the lobe transform so subsequent canvas work uses page coordinates.
  context.save();
  context.translate(center_x, center_y);
  context.rotate(rotation);

  // Draw nested, slightly non-uniform paths to suggest a measured light field.
  for (let ring_index = 0; ring_index < 15; ring_index += 1) {
    const ring_progress = ring_index / 14;
    const ring_radius = radius * (0.38 + ring_progress * 0.78);
    const vertical_radius = ring_radius * (0.58 + Math.sin(ring_index * 0.76) * 0.055);
    const ring_alpha = 0.052 * (1 - ring_progress * 0.64);

    context.beginPath();
    context.ellipse(0, 0, ring_radius, vertical_radius, ring_progress * 0.08, 0, Math.PI * 2);
    context.strokeStyle = `rgba(120, 154, 161, ${ring_alpha})`;
    context.lineWidth = 0.72;
    context.stroke();
  }

  // Restore the page coordinate system after the lobe is complete.
  context.restore();
}

/**
 * Draw one tapered bamboo leaf with a faint central vein.
 *
 * @param {CanvasRenderingContext2D} context - Active light-field drawing
 *   context. It must support path, Bézier-curve, fill, and stroke operations.
 * @param {number} center_x - Horizontal leaf center in CSS pixels. Any finite
 *   canvas-local coordinate is accepted, including a partially clipped edge.
 * @param {number} center_y - Vertical leaf center in CSS pixels. Any finite
 *   canvas-local coordinate is accepted.
 * @param {number} length - Leaf length in CSS pixels. Positive values between
 *   `8` and `16` are used by the particle generator.
 * @param {number} width - Half-width of the leaf in CSS pixels. Positive values
 *   between `2` and `4` preserve the intended slender silhouette.
 * @param {number} rotation - Leaf rotation in radians. Any finite value is
 *   accepted and wraps naturally through the canvas transform.
 * @param {number} opacity - Leaf fill opacity in the inclusive `[0, 1]` range.
 *   The ambient renderer normally keeps this below `0.34`.
 * @returns {void} The function returns no value and paints one leaf in place.
 * @throws {Error} This function does not validate the canvas context; an
 *   incompatible context surfaces the browser's native drawing error.
 * @example
 * _draw_bamboo_leaf(context, 420, 260, 12, 3, 0.4, 0.25);
 */
function _draw_bamboo_leaf(context, center_x, center_y, length, width, rotation, opacity) {
  // Establish the local leaf coordinate system without affecting later drawing.
  const half_length = length * 0.5;
  context.save();
  context.translate(center_x, center_y);
  context.rotate(rotation);

  // Build two asymmetric curves that read as a narrow falling bamboo leaf.
  context.beginPath();
  context.moveTo(-half_length, 0);
  context.bezierCurveTo(-length * 0.18, -width, length * 0.24, -width * 0.72, half_length, 0);
  context.bezierCurveTo(length * 0.18, width * 0.68, -length * 0.22, width, -half_length, 0);
  context.fillStyle = `rgba(49, 79, 67, ${opacity})`;
  context.fill();

  // Add one restrained vein so the particle remains legible at small sizes.
  context.beginPath();
  context.moveTo(-length * 0.3, 0);
  context.lineTo(length * 0.34, 0);
  context.strokeStyle = `rgba(120, 154, 137, ${opacity * 0.46})`;
  context.lineWidth = 0.42;
  context.stroke();
  context.restore();
}

/**
 * Add one bounded bamboo-leaf particle near the current pointer position.
 *
 * @param {number} center_x - Pointer-adjacent horizontal origin in CSS pixels.
 *   Any finite coordinate is accepted; random variation may place the leaf up
 *   to approximately `26` pixels to either side.
 * @param {number} center_y - Pointer-adjacent vertical origin in CSS pixels.
 *   Any finite coordinate is accepted.
 * @returns {void} The function returns no value. It appends at most one mutable
 *   leaf record to the shared particle pool.
 * @throws {Error} This function does not throw intentionally. It relies on
 *   `Math.random` and ordinary array mutation.
 * @example
 * _spawn_bamboo_leaf(640, 360);
 *
 * @sideEffects Mutates `bamboo_leaves` unless the bounded pool is already full.
 */
function _spawn_bamboo_leaf(center_x, center_y) {
  // Keep the ambient effect sparse and its per-frame drawing cost predictable.
  if (bamboo_leaves.length >= maximum_bamboo_leaf_count) {
    return;
  }

  // Create a short-lived leaf with independently varied fall, sway, and rotation.
  bamboo_leaves.push({
    x: center_x + (Math.random() - 0.5) * 52,
    y: center_y - 8 + Math.random() * 18,
    length: 8 + Math.random() * 8,
    width: 2 + Math.random() * 1.8,
    fall_speed: 18 + Math.random() * 18,
    drift_speed: -5 + Math.random() * 10,
    sway_amplitude: 2.5 + Math.random() * 4.5,
    sway_frequency: 1.4 + Math.random() * 1.4,
    phase: Math.random() * Math.PI * 2,
    rotation: -0.8 + Math.random() * 1.6,
    angular_velocity: -0.5 + Math.random(),
    age: 0,
    lifetime: 1.9 + Math.random() * 1.2,
  });
}

/**
 * Advance, cull, and draw the bamboo leaves surrounding the pointer.
 *
 * @param {CanvasRenderingContext2D} context - Active light-field drawing
 *   context. It must already use CSS-pixel coordinates.
 * @param {number} delta_seconds - Elapsed time since the previous frame in
 *   seconds. Callers clamp it to `[0, 0.05]` to avoid large jumps after a pause.
 * @param {number} pointer_x - Current pointer target in canvas-local CSS pixels.
 * @param {number} pointer_y - Current pointer target in canvas-local CSS pixels.
 * @returns {void} The function returns no value. It updates the shared particle
 *   pool and draws each surviving leaf.
 * @throws {Error} No error is raised for an empty pool. Invalid canvas contexts
 *   surface their native drawing errors through `_draw_bamboo_leaf`.
 * @example
 * _render_bamboo_leaves(context, 1 / 60, 640, 360);
 *
 * @sideEffects Mutates `bamboo_leaf_spawn_elapsed`, every live leaf record, and
 *   `bamboo_leaves`; also paints translucent paths on `context`.
 */
function _render_bamboo_leaves(context, delta_seconds, pointer_x, pointer_y) {
  // Remove motion entirely for visitors who requested a stable presentation.
  if (reduced_motion_query.matches) {
    bamboo_leaves.length = 0;
    bamboo_leaf_spawn_elapsed = 0;
    return;
  }

  // Emit leaves at a slow, bounded cadence only after a real pointer is present.
  if (light_field_pointer_active) {
    bamboo_leaf_spawn_elapsed += delta_seconds;
    while (bamboo_leaf_spawn_elapsed >= 0.38) {
      bamboo_leaf_spawn_elapsed -= 0.38;
      _spawn_bamboo_leaf(pointer_x, pointer_y);
    }
  }

  // Update backwards so expired particles can be removed without skipping items.
  for (let leaf_index = bamboo_leaves.length - 1; leaf_index >= 0; leaf_index -= 1) {
    const leaf = bamboo_leaves[leaf_index];
    leaf.age += delta_seconds;
    if (leaf.age >= leaf.lifetime) {
      bamboo_leaves.splice(leaf_index, 1);
      continue;
    }

    // Advance the quiet fall before deriving sway and lifetime opacity.
    leaf.x += leaf.drift_speed * delta_seconds;
    leaf.y += leaf.fall_speed * delta_seconds;
    leaf.rotation += leaf.angular_velocity * delta_seconds;
    const sway_x = Math.sin(leaf.phase + leaf.age * leaf.sway_frequency) * leaf.sway_amplitude;
    const fade_in = _clamp(leaf.age / 0.22, 0, 1);
    const fade_out = _clamp((leaf.lifetime - leaf.age) / 0.58, 0, 1);
    const opacity = 0.34 * Math.min(fade_in, fade_out);

    // Paint the current leaf after all frame-local values are resolved.
    _draw_bamboo_leaf(
      context,
      leaf.x + sway_x,
      leaf.y,
      leaf.length,
      leaf.width,
      leaf.rotation,
      opacity,
    );
  }
}

/**
 * Draw one cropped sword image around a caller-selected local anchor.
 *
 * @param {CanvasRenderingContext2D} context - Active light-field drawing
 *   context using CSS-pixel coordinates and supporting `drawImage`.
 * @param {number} anchor_x - Horizontal anchor position in CSS pixels.
 * @param {number} anchor_y - Vertical anchor position in CSS pixels.
 * @param {number} height - Rendered sword height in CSS pixels. Values at or
 *   below zero are ignored; the authored effect uses approximately `48–66`.
 * @param {number} rotation - Clockwise sword rotation in radians. A value of
 *   zero keeps the source sword pointing down.
 * @param {number} opacity - Local opacity in the inclusive `[0, 1]` range.
 * @param {number} anchor_y_ratio - Vertical anchor measured from the image top,
 *   normalized to `[0, 1]`; the authored trail and wheel both pass `0.255` so
 *   every transition preserves the sword-guard pivot.
 * @returns {void} The function returns no value and paints at most one sword.
 * @throws {Error} No error is raised while the image is still loading. An
 *   incompatible canvas context surfaces its native drawing error.
 * @example
 * _draw_sword(context, 640, 360, 60, 0, 0.8, 0.255);
 */
function _draw_sword(context, anchor_x, anchor_y, height, rotation, opacity, anchor_y_ratio) {
  // Wait for the decoded source asset and reject geometry that cannot be seen.
  if (
    !sword_image
    || !sword_image.complete
    || sword_image.naturalWidth <= 0
    || height <= 0
    || opacity <= 0
  ) {
    return;
  }

  // Preserve the sword's tightly cropped aspect ratio at the requested height.
  const display_width = height * (sword_source_crop.width / sword_source_crop.height);
  const bounded_anchor_y_ratio = _clamp(anchor_y_ratio, 0, 1);

  // Isolate transform, alpha, and restrained teal glow from the ambient field.
  context.save();
  context.translate(anchor_x, anchor_y);
  context.rotate(rotation);
  context.globalAlpha = _clamp(opacity, 0, 1);
  context.shadowColor = "rgba(21, 90, 69, 0.48)";
  context.shadowBlur = _clamp(height * 0.055, 2, 4.2);

  // Crop the original transparent margins during drawing to keep the sword crisp.
  context.drawImage(
    sword_image,
    sword_source_crop.x,
    sword_source_crop.y,
    sword_source_crop.width,
    sword_source_crop.height,
    -display_width / 2,
    -height * bounded_anchor_y_ratio,
    display_width,
    height,
  );
  context.restore();
}

/**
 * Derive viewport-aware geometry and breakout thresholds for the sword system.
 *
 * @returns {{base_height: number, wheel_radius: number, bounding_radius: number,
 *   breakout_speed: number}} A fresh metrics record in CSS-pixel units. Sword
 *   height stays within `48–66`, and speed is measured in CSS pixels per second.
 * @throws {Error} This helper does not throw. It reads cached canvas dimensions.
 * @example
 * const metrics = _get_sword_metrics();
 */
function _get_sword_metrics() {
  // Scale the authored source down while preserving the approved compact wheel.
  const base_height = _clamp(
    Math.min(light_field_width, light_field_height) * 0.076,
    48,
    66,
  );
  const wheel_radius = base_height * 0.5;

  // Include the outward blade length so breakout uses the visible wheel boundary.
  const bounding_radius = (
    wheel_radius
    + base_height * (1 - sword_guard_anchor_ratio) * 0.96
    + 6
  );
  const breakout_speed = _clamp(base_height * 8.5, 460, 620);
  return { base_height, wheel_radius, bounding_radius, breakout_speed };
}

/**
 * Prepare a single-file procession from the active trail into wheel slots.
 *
 * The trail leader defines one fixed entry gate on the wheel. Every later
 * sword receives the slot immediately behind it, so each entity reaches that
 * same gate exactly after the preceding entity has rotated by one slot angle.
 *
 * @param {number} pointer_x - New wheel-center x coordinate in CSS pixels.
 *   Any finite viewport-local coordinate is accepted.
 * @param {number} pointer_y - New wheel-center y coordinate in CSS pixels.
 *   Any finite viewport-local coordinate is accepted.
 * @param {number} wheel_radius - Positive sword-guard orbit radius in CSS
 *   pixels. Values at or below zero produce degenerate staging geometry.
 * @returns {void} The function returns no value. It preserves every visible
 *   pose while assigning a deterministic procession order and unique slots.
 * @throws {Error} This helper does not throw intentionally. The configured
 *   persistent entities and six active trail identities must remain valid and
 *   unique.
 * @example
 * _prepare_sword_wheel_procession(640, 360, 30);
 *
 * @sideEffects Mutates formation order, formation entry angle, wheel phase and
 *   center, entity slot assignments, invisible staging poses, and per-entity
 *   correction offsets used to preserve the first frame exactly.
 */
function _prepare_sword_wheel_procession(pointer_x, pointer_y, wheel_radius) {
  // Resolve one entry direction from the leader's motion, orientation, and position.
  const leader_entity = sword_entities[sword_trail_entity_indices[0]];
  const leader_slot_index = leader_entity.slot_index;
  const heading_angle = sword_trail_rotation + Math.PI / 2;
  const rotation_angle = leader_entity.rotation + Math.PI / 2;
  const leader_distance = Math.hypot(
    leader_entity.x - pointer_x,
    leader_entity.y - pointer_y,
  );
  const position_angle = leader_distance > 2
    ? Math.atan2(leader_entity.y - pointer_y, leader_entity.x - pointer_x)
    : heading_angle;
  const phase_vector_x = (
    Math.cos(heading_angle) * 0.5
    + Math.cos(rotation_angle) * 0.35
    + Math.cos(position_angle) * 0.15
  );
  const phase_vector_y = (
    Math.sin(heading_angle) * 0.5
    + Math.sin(rotation_angle) * 0.35
    + Math.sin(position_angle) * 0.15
  );
  sword_formation_entry_angle = Math.atan2(phase_vector_y, phase_vector_x);
  sword_wheel_center_x = pointer_x;
  sword_wheel_center_y = pointer_y;
  sword_wheel_rotation = (
    sword_formation_entry_angle - leader_slot_index * sword_wheel_slot_step
  );

  // Put the six visible followers first, then append every hidden wheel identity.
  const trail_entity_set = new Set(sword_trail_entity_indices);
  const formation_order = [
    ...sword_trail_entity_indices,
    ...sword_formation_entity_indices.filter((sword_entity_id) => (
      !trail_entity_set.has(sword_entity_id)
    )),
  ];
  for (let formation_index = 0; formation_index < formation_order.length; formation_index += 1) {
    const sword_entity_id = formation_order[formation_index];
    const sword_entity = sword_entities[sword_entity_id];
    sword_formation_entity_indices[formation_index] = sword_entity_id;
    sword_entity.formation_index = formation_index;
    sword_entity.slot_index = (
      leader_slot_index - formation_index + maximum_sword_wheel_count
    ) % maximum_sword_wheel_count;
  }

  // Seed only fully invisible swords at the shared approach lane; visible poses stay continuous.
  const entry_direction_x = Math.cos(sword_formation_entry_angle);
  const entry_direction_y = Math.sin(sword_formation_entry_angle);
  const entry_gate_x = pointer_x + entry_direction_x * wheel_radius;
  const entry_gate_y = pointer_y + entry_direction_y * wheel_radius;
  const minimum_procession_spacing = (
    wheel_radius * 2 * sword_trail_minimum_spacing_scale
  );
  sword_formation_procession_spacing = Math.max(
    minimum_procession_spacing,
    sword_trail_spacing,
  );
  const procession_spacing = sword_formation_procession_spacing;
  const staging_distance = procession_spacing * sword_formation_hidden_stage_steps;
  for (let formation_index = maximum_sword_trail_count;
    formation_index < maximum_sword_wheel_count;
    formation_index += 1) {
    const sword_entity = sword_entities[sword_formation_entity_indices[formation_index]];
    if (sword_entity.opacity > 0.003) {
      continue;
    }
    sword_entity.x = entry_gate_x - entry_direction_x * staging_distance;
    sword_entity.y = entry_gate_y - entry_direction_y * staging_distance;
    sword_entity.rotation = sword_formation_entry_angle - Math.PI / 2;
    sword_entity.height_scale = 0.84;
  }

  // Snapshot each current-pose difference so the analytic path starts without a jump.
  for (let formation_index = 0;
    formation_index < maximum_sword_wheel_count;
    formation_index += 1) {
    const sword_entity = sword_entities[sword_formation_entity_indices[formation_index]];
    const initial_lane_distance = formation_index < maximum_sword_trail_count
      ? formation_index * procession_spacing
      : staging_distance;
    const canonical_x = entry_gate_x - entry_direction_x * initial_lane_distance;
    const canonical_y = entry_gate_y - entry_direction_y * initial_lane_distance;
    const canonical_rotation = sword_formation_entry_angle - Math.PI / 2;
    sword_entity.formation_offset_x = sword_entity.x - canonical_x;
    sword_entity.formation_offset_y = sword_entity.y - canonical_y;
    sword_entity.formation_rotation_offset = Math.atan2(
      Math.sin(sword_entity.rotation - canonical_rotation),
      Math.cos(sword_entity.rotation - canonical_rotation),
    );
  }
}

/**
 * Begin the direct transition from six moving swords into the rotating wheel.
 *
 * @param {number} pointer_x - Current pointer x coordinate in CSS pixels.
 * @param {number} pointer_y - Current pointer y coordinate in CSS pixels.
 * @param {number} wheel_radius - Positive target guard-orbit radius in CSS pixels.
 * @returns {void} The function returns no value. Existing sword poses and
 *   opacity remain untouched while only their targets and roles change.
 * @throws {Error} This helper does not throw intentionally.
 * @example
 * _begin_sword_formation(640, 360, 30);
 *
 * @sideEffects Mutates sword mode, formation state, wheel mapping, and center.
 */
function _begin_sword_formation(pointer_x, pointer_y, wheel_radius) {
  // Compute one shared entry gate and a stable identity order before movement begins.
  _prepare_sword_wheel_procession(pointer_x, pointer_y, wheel_radius);

  // Start rotation immediately without fading the six existing swords away.
  sword_mode = "forming";
  sword_formation_elapsed = 0;
  sword_breakout_sample_count = 0;
  sword_breakout_leader_index = -1;
}

/**
 * Begin wheel extraction with the stable first six swords in formation order.
 *
 * The same persistent entity that enters the wheel first always leaves first;
 * the next five ordered identities follow it without proximity-based sorting.
 * Current pose, scale, and opacity remain untouched for visual continuity.
 *
 * @returns {void} The function returns no value. It restores the ordered first
 *   six identities to trail roles and starts their staggered extraction clock.
 * @throws {Error} This helper does not throw intentionally. The formation order
 *   must contain the configured number of valid and unique persistent sword IDs.
 * @example
 * _begin_sword_extraction();
 *
 * @sideEffects Mutates trail identity order, breakout metadata, and sword mode.
 */
function _begin_sword_extraction() {
  // Restore the permanent queue head instead of selecting a new spatial leader.
  for (let trail_index = 0; trail_index < maximum_sword_trail_count; trail_index += 1) {
    sword_trail_entity_indices[trail_index] = sword_formation_entity_indices[trail_index];
  }

  // Start the stagger while preserving every selected sword's real wheel pose.
  sword_breakout_leader_index = sword_trail_entity_indices[0];
  sword_trail_transition_elapsed = 0;
  sword_breakout_sample_count = 0;
  sword_mode = "extracting";
}

/**
 * Advance the wheel-following or wheel-forming pose for every configured sword.
 *
 * @param {number} delta_seconds - Bounded frame duration in seconds.
 * @param {number} wheel_radius - Positive sword-guard orbit radius in CSS pixels.
 * @returns {void} The function returns no value. It advances one shared wheel
 *   clock, moves queued swords through the same entry gate one at a time, and
 *   promotes the completed procession to calm orbiting.
 * @throws {Error} This helper does not throw intentionally.
 * @example
 * _update_sword_wheel_entities(1 / 60, 30);
 *
 * @sideEffects Mutates wheel rotation/timing, sword mode, and every entity.
 */
function _update_sword_wheel_entities(delta_seconds, wheel_radius) {
  // Advance the formation clock and decelerate only after the final sword arrives.
  if (sword_mode === "forming") {
    sword_formation_elapsed += delta_seconds;
  }
  const final_arrival_time = (
    (maximum_sword_wheel_count - 1) * sword_formation_arrival_interval
  );
  const deceleration_progress = _smoothstep(
    (sword_formation_elapsed - final_arrival_time)
      / sword_formation_deceleration_duration,
  );
  const angular_speed = sword_mode === "forming"
    ? sword_formation_angular_speed
      + (0.58 - sword_formation_angular_speed) * deceleration_progress
    : 0.58;
  sword_wheel_rotation += delta_seconds * angular_speed;

  // Derive the fixed entry gate and the single-file lane that feeds it.
  const entry_direction_x = Math.cos(sword_formation_entry_angle);
  const entry_direction_y = Math.sin(sword_formation_entry_angle);
  const entry_gate_x = sword_wheel_center_x + entry_direction_x * wheel_radius;
  const entry_gate_y = sword_wheel_center_y + entry_direction_y * wheel_radius;
  const procession_spacing = Math.max(
    wheel_radius * 2 * sword_trail_minimum_spacing_scale,
    sword_formation_procession_spacing,
  );
  const staging_distance = procession_spacing * sword_formation_hidden_stage_steps;

  // Keep each waiting sword in line, then hand it to its rotating slot at the gate.
  for (const sword_entity of sword_entities) {
    const arrival_time = sword_entity.formation_index * sword_formation_arrival_interval;
    const has_arrived = (
      sword_mode === "orbiting"
      || sword_formation_elapsed >= arrival_time
    );
    let target_x;
    let target_y;
    let target_rotation;
    let target_opacity;
    let target_height_scale;
    if (has_arrived) {
      // Once admitted, the persistent identity follows its unique rotating slot.
      const slot_angle = (
        sword_wheel_rotation + sword_entity.slot_index * sword_wheel_slot_step
      );
      target_x = sword_wheel_center_x + Math.cos(slot_angle) * wheel_radius;
      target_y = sword_wheel_center_y + Math.sin(slot_angle) * wheel_radius;
      target_rotation = slot_angle - Math.PI / 2;
      target_opacity = 0.88;
      target_height_scale = 0.96;
    } else {
      // Advance the visible queue by one equal sword spacing per wheel slot period.
      const remaining_intervals = (
        (arrival_time - sword_formation_elapsed) / sword_formation_arrival_interval
      );
      const unconstrained_distance = remaining_intervals * procession_spacing;
      const is_original_trail_sword = (
        sword_entity.formation_index < maximum_sword_trail_count
      );
      const lane_distance = is_original_trail_sword
        ? unconstrained_distance
        : Math.min(unconstrained_distance, staging_distance);
      target_x = entry_gate_x - entry_direction_x * lane_distance;
      target_y = entry_gate_y - entry_direction_y * lane_distance;
      target_rotation = sword_formation_entry_angle - Math.PI / 2;

      // Preserve the original six; reveal every later sword only on its own approach.
      if (is_original_trail_sword) {
        target_opacity = sword_trail_opacity_levels[sword_entity.formation_index];
        target_height_scale = sword_trail_scale_levels[sword_entity.formation_index];
      } else {
        const reveal_progress = _smoothstep(
          (sword_formation_elapsed - arrival_time + sword_formation_reveal_duration)
            / sword_formation_reveal_duration,
        );
        target_opacity = 0.88 * reveal_progress;
        target_height_scale = 0.84 + reveal_progress * 0.12;
      }
    }

    // Use exact procession poses while a decaying snapshot offset protects frame one.
    if (sword_mode === "forming") {
      const correction_duration = Math.max(0.1, arrival_time);
      const correction_weight = 1 - _smoothstep(
        sword_formation_elapsed / correction_duration,
      );
      sword_entity.x = target_x + sword_entity.formation_offset_x * correction_weight;
      sword_entity.y = target_y + sword_entity.formation_offset_y * correction_weight;
      sword_entity.rotation = (
        target_rotation + sword_entity.formation_rotation_offset * correction_weight
      );
    } else {
      // After assembly, damp only the tiny per-frame orbit displacement for calmness.
      sword_entity.x = _damp_value(sword_entity.x, target_x, 22, delta_seconds);
      sword_entity.y = _damp_value(sword_entity.y, target_y, 22, delta_seconds);
      sword_entity.rotation = _damp_angle(
        sword_entity.rotation,
        target_rotation,
        24,
        delta_seconds,
      );
    }
    sword_entity.opacity = _damp_value(
      sword_entity.opacity,
      target_opacity,
      target_opacity > sword_entity.opacity ? 22 : 18,
      delta_seconds,
    );
    sword_entity.height_scale = _damp_value(
      sword_entity.height_scale,
      target_height_scale,
      18,
      delta_seconds,
    );
  }

  // End formation only after the last arrival and the deliberate speed settle.
  const formation_duration = final_arrival_time + sword_formation_deceleration_duration;
  if (sword_mode === "forming" && sword_formation_elapsed >= formation_duration) {
    sword_mode = "orbiting";
  }
}

/**
 * Advance six follower swords, including continuous extraction from the wheel.
 *
 * @param {number} delta_seconds - Bounded frame duration in seconds.
 * @param {number} pointer_x - Current canvas-local pointer x coordinate.
 * @param {number} pointer_y - Current canvas-local pointer y coordinate.
 * @param {number} wheel_radius - Positive guard-orbit radius in CSS pixels.
 * @returns {void} The function returns no value. Six selected entities pursue
 *   the pointer's forward ring slot while every non-trail identity fades from
 *   its real wheel position.
 * @throws {Error} This helper does not throw intentionally.
 * @example
 * _update_sword_trail_entities(1 / 60, 640, 360, 30);
 *
 * @sideEffects Mutates extraction timing, sword mode, wheel phase, and entities.
 */
function _update_sword_trail_entities(delta_seconds, pointer_x, pointer_y, wheel_radius) {
  // Derive pair-specific, non-overlapping arc gaps that stretch smoothly with speed.
  sword_trail_transition_elapsed += delta_seconds;
  const base_height = wheel_radius * 2;
  const breakout_speed = _clamp(base_height * 8.5, 460, 620);
  const spacing_low_speed = breakout_speed * 0.16;
  const spacing_high_speed = breakout_speed * 0.65;
  const speed_progress = _smoothstep(
    (sword_pointer_speed - spacing_low_speed) / (spacing_high_speed - spacing_low_speed),
  );
  sword_trail_arc_distances[0] = 0;
  for (let pair_index = 0; pair_index < sword_trail_pair_spacings.length; pair_index += 1) {
    const minimum_spacing = _get_sword_pair_minimum_spacing(base_height, pair_index);
    const maximum_spacing = Math.min(minimum_spacing + base_height * 0.42, 96);
    const target_spacing = minimum_spacing
      + (maximum_spacing - minimum_spacing) * speed_progress;
    if (sword_trail_pair_spacings[pair_index] <= 0) {
      sword_trail_pair_spacings[pair_index] = minimum_spacing;
    }
    const spacing_response = target_spacing > sword_trail_pair_spacings[pair_index]
      ? 12
      : 6;
    sword_trail_pair_spacings[pair_index] = _clamp(
      _damp_value(
        sword_trail_pair_spacings[pair_index],
        target_spacing,
        spacing_response,
        delta_seconds,
      ),
      minimum_spacing,
      maximum_spacing,
    );
    sword_trail_arc_distances[pair_index + 1] = (
      sword_trail_arc_distances[pair_index] + sword_trail_pair_spacings[pair_index]
    );
  }
  sword_trail_spacing = Math.max(...sword_trail_pair_spacings);

  // Ensure direct diagnostic calls still have a valid path before target sampling.
  if (sword_trail_path_samples.length === 0) {
    _seed_sword_trail_path(
      pointer_x,
      pointer_y,
      wheel_radius,
      sword_pointer_event_timestamp,
    );
  }
  const trail_entity_set = new Set(sword_trail_entity_indices);

  // Keep the old wheel rotating briefly while its six selected swords peel away.
  if (sword_mode === "extracting") {
    sword_wheel_rotation += delta_seconds * 0.58;
  }

  // Blend each selected identity from its current wheel slot into its trail role.
  for (let trail_index = 0; trail_index < maximum_sword_trail_count; trail_index += 1) {
    const sword_entity = sword_entities[sword_trail_entity_indices[trail_index]];
    const trail_target = _sample_sword_trail_path(
      sword_trail_arc_distances[trail_index],
    );
    Object.assign(sword_trail_target_samples[trail_index], trail_target);
    const trail_target_x = trail_target.x;
    const trail_target_y = trail_target.y;
    const trail_target_rotation = trail_target.rotation;

    // During extraction, preserve the wheel path until each staggered peel begins.
    let target_x = trail_target_x;
    let target_y = trail_target_y;
    let target_rotation = trail_target_rotation;
    let target_opacity = sword_trail_opacity_levels[trail_index];
    if (sword_mode === "extracting") {
      const extraction_delay = trail_index * sword_extraction_stagger_interval;
      const extraction_progress = _smoothstep(
        (sword_trail_transition_elapsed - extraction_delay) / sword_extraction_blend_duration,
      );
      const slot_angle = (
        sword_wheel_rotation + sword_entity.slot_index * sword_wheel_slot_step
      );
      const wheel_target_x = sword_wheel_center_x + Math.cos(slot_angle) * wheel_radius;
      const wheel_target_y = sword_wheel_center_y + Math.sin(slot_angle) * wheel_radius;
      const wheel_target_rotation = slot_angle - Math.PI / 2;
      const rotation_difference = Math.atan2(
        Math.sin(trail_target_rotation - wheel_target_rotation),
        Math.cos(trail_target_rotation - wheel_target_rotation),
      );
      target_x = wheel_target_x + (trail_target_x - wheel_target_x) * extraction_progress;
      target_y = wheel_target_y + (trail_target_y - wheel_target_y) * extraction_progress;
      target_rotation = wheel_target_rotation + rotation_difference * extraction_progress;
      target_opacity = (
        0.88
        + (sword_trail_opacity_levels[trail_index] - 0.88) * extraction_progress
      );
    }

    // Follow the recorded path exactly in trail mode; damp only the live wheel peel.
    if (sword_mode === "trailing") {
      sword_entity.x = target_x;
      sword_entity.y = target_y;
      sword_entity.rotation = target_rotation;
    } else {
      sword_entity.x = _damp_value(
        sword_entity.x,
        target_x,
        sword_extraction_position_response,
        delta_seconds,
      );
      sword_entity.y = _damp_value(
        sword_entity.y,
        target_y,
        sword_extraction_position_response,
        delta_seconds,
      );
      sword_entity.rotation = _damp_angle(
        sword_entity.rotation,
        target_rotation,
        13,
        delta_seconds,
      );
    }
    sword_entity.opacity = _damp_value(
      sword_entity.opacity,
      target_opacity,
      16,
      delta_seconds,
    );
    sword_entity.height_scale = _damp_value(
      sword_entity.height_scale,
      sword_trail_scale_levels[trail_index],
      14,
      delta_seconds,
    );
  }

  // Let every unselected wheel sword finish its orbit while fading away.
  for (const sword_entity of sword_entities) {
    if (trail_entity_set.has(sword_entity.id)) {
      continue;
    }
    if (sword_mode === "extracting") {
      const slot_angle = (
        sword_wheel_rotation + sword_entity.slot_index * sword_wheel_slot_step
      );
      const wheel_target_x = sword_wheel_center_x + Math.cos(slot_angle) * wheel_radius;
      const wheel_target_y = sword_wheel_center_y + Math.sin(slot_angle) * wheel_radius;
      sword_entity.x = _damp_value(sword_entity.x, wheel_target_x, 20, delta_seconds);
      sword_entity.y = _damp_value(sword_entity.y, wheel_target_y, 20, delta_seconds);
      sword_entity.rotation = _damp_angle(
        sword_entity.rotation,
        slot_angle - Math.PI / 2,
        22,
        delta_seconds,
      );
    }
    sword_entity.opacity = _damp_value(sword_entity.opacity, 0, 19, delta_seconds);
  }

  // Finish extraction only after the sixth sword has had time to leave its slot.
  if (
    sword_mode === "extracting"
    && sword_trail_transition_elapsed >= sword_extraction_total_duration
  ) {
    sword_mode = "trailing";
  }
}

/**
 * Draw persistent sword entities with the six active followers layered last.
 *
 * @param {CanvasRenderingContext2D} context - Active 2D canvas context using
 *   CSS-pixel coordinates.
 * @param {number} base_height - Positive viewport-aware sword height in CSS pixels.
 * @returns {void} The function returns no value and paints each visible entity
 *   exactly once with a shared sword-guard anchor.
 * @throws {Error} Invalid canvas contexts surface native errors through
 *   `_draw_sword`; an unloaded image is ignored safely.
 * @example
 * _draw_sword_entities(context, 60);
 */
function _draw_sword_entities(context, base_height) {
  // Draw inactive or fading wheel entities beneath the six active trail identities.
  for (const sword_entity of sword_entities) {
    if (sword_trail_entity_indices.includes(sword_entity.id) || sword_entity.opacity <= 0.003) {
      continue;
    }
    _draw_sword(
      context,
      sword_entity.x,
      sword_entity.y,
      base_height * sword_entity.height_scale,
      sword_entity.rotation,
      sword_entity.opacity,
      sword_guard_anchor_ratio,
    );
  }

  // Paint the farthest follower first and the leader last for clear directional depth.
  for (let trail_index = maximum_sword_trail_count - 1; trail_index >= 0; trail_index -= 1) {
    const sword_entity = sword_entities[sword_trail_entity_indices[trail_index]];
    if (sword_entity.opacity <= 0.003) {
      continue;
    }
    _draw_sword(
      context,
      sword_entity.x,
      sword_entity.y,
      base_height * sword_entity.height_scale,
      sword_entity.rotation,
      sword_entity.opacity,
      sword_guard_anchor_ratio,
    );
  }
}

/**
 * Update and render the continuous trail, formation, wheel, or extraction state.
 *
 * @param {CanvasRenderingContext2D} context - Active 2D canvas context using
 *   CSS-pixel coordinates.
 * @param {number} delta_seconds - Bounded frame duration in seconds, normally
 *   within `[0, 0.05]`.
 * @param {number} pointer_x - Exact canvas-local pointer x coordinate in CSS pixels.
 * @param {number} pointer_y - Exact canvas-local pointer y coordinate in CSS pixels.
 * @returns {void} The function returns no value. It advances pointer velocity,
 *   performs guarded state transitions, updates persistent entities, and draws.
 * @throws {Error} No error is raised while the sword asset is loading. Invalid
 *   contexts can surface their native canvas errors through drawing helpers.
 * @example
 * _render_sword_effect(context, 1 / 60, 640, 360);
 *
 * @sideEffects Mutates all shared flying-sword timing, mode, and entity state.
 */
function _render_sword_effect(context, delta_seconds, pointer_x, pointer_y) {
  // Remove decorative sword movement entirely under reduced-motion preference.
  if (reduced_motion_query.matches) {
    _reset_sword_effect();
    return;
  }

  // Leave an inactive canvas empty until a fine pointer has entered the page.
  if (!light_field_pointer_active || !sword_pointer_initialized) {
    return;
  }

  // Advance idle timing and decay stale event velocity without changing heading.
  if (Number.isFinite(sword_seconds_since_motion)) {
    sword_seconds_since_motion += delta_seconds;
  }
  if (sword_seconds_since_motion > 0.025) {
    const velocity_decay = Math.exp(-delta_seconds / 0.06);
    sword_pointer_velocity_x *= velocity_decay;
    sword_pointer_velocity_y *= velocity_decay;
    sword_pointer_speed = Math.hypot(sword_pointer_velocity_x, sword_pointer_velocity_y);
  }
  const sword_metrics = _get_sword_metrics();

  // Move directly from the offset trail into rotating wheel targets after rest.
  if (
    sword_mode === "trailing"
    && sword_seconds_since_motion >= 0.12
    && sword_pointer_speed < 100
  ) {
    _begin_sword_formation(pointer_x, pointer_y, sword_metrics.wheel_radius);
  }

  // Let a slow wheel follow; require both high speed and true boundary escape to peel it.
  if (sword_mode === "forming" || sword_mode === "orbiting") {
    const pointer_gap = Math.hypot(
      pointer_x - sword_wheel_center_x,
      pointer_y - sword_wheel_center_y,
    );
    const required_breakout_speed = sword_breakout_sample_count > 0
      ? sword_metrics.breakout_speed * 0.68
      : sword_metrics.breakout_speed;
    const pointer_escaped = (
      sword_pointer_speed > required_breakout_speed
      && pointer_gap > sword_metrics.bounding_radius
    );
    sword_breakout_sample_count = pointer_escaped ? sword_breakout_sample_count + 1 : 0;
    if (sword_breakout_sample_count >= 2) {
      _begin_sword_extraction();
    } else if (!pointer_escaped) {
      const center_time_constant = sword_pointer_speed > sword_metrics.breakout_speed
        ? 0.18
        : 0.085;
      const center_response = 1 / center_time_constant;
      sword_wheel_center_x = _damp_value(
        sword_wheel_center_x,
        pointer_x,
        center_response,
        delta_seconds,
      );
      sword_wheel_center_y = _damp_value(
        sword_wheel_center_y,
        pointer_y,
        center_response,
        delta_seconds,
      );
    }
  }

  // Update one mutually exclusive pose system, then draw each persistent identity once.
  if (sword_mode === "forming" || sword_mode === "orbiting") {
    _update_sword_wheel_entities(delta_seconds, sword_metrics.wheel_radius);
  } else if (sword_mode === "trailing" || sword_mode === "extracting") {
    _update_sword_trail_entities(
      delta_seconds,
      pointer_x,
      pointer_y,
      sword_metrics.wheel_radius,
    );
  }
  _draw_sword_entities(context, sword_metrics.base_height);
}

/**
 * Render one frame of the pointer-responsive light-field signature.
 *
 * @param {DOMHighResTimeStamp} timestamp - Animation timestamp supplied by
 *   `requestAnimationFrame`, measured in milliseconds. It drives the subtle
 *   breathing term, bamboo leaves, and flying-sword state transitions.
 * @returns {void} The function returns no value. It clears and redraws the
 *   transparent canvas and schedules the next frame when motion is allowed.
 * @throws {Error} No error is raised when the canvas is unavailable; rendering
 *   stops and the underlying static homepage remains intact.
 * @example
 * light_field_animation_frame = window.requestAnimationFrame(_render_light_field);
 */
function _render_light_field(timestamp) {
  // Mark the queued frame as consumed before deciding whether another is needed.
  light_field_animation_frame = 0;

  // Stop the animation loop when canvas support is missing.
  if (!light_field_context || !light_field_canvas) {
    return;
  }

  // Derive a bounded time step so restored tabs cannot make ambient effects jump.
  const delta_seconds = bamboo_leaf_previous_timestamp > 0
    ? _clamp((timestamp - bamboo_leaf_previous_timestamp) / 1000, 0, 0.05)
    : 0;
  bamboo_leaf_previous_timestamp = timestamp;

  // Follow the pointer quickly while retaining a small amount of contemplative inertia.
  light_field_pointer_x += (light_field_target_x - light_field_pointer_x) * 0.18;
  light_field_pointer_y += (light_field_target_y - light_field_pointer_y) * 0.18;

  // Clear the transparent layer and derive one responsive focus in viewport space.
  light_field_context.clearRect(0, 0, light_field_width, light_field_height);
  const calm_breath = reduced_motion_query.matches ? 0 : Math.sin(timestamp * 0.00042) * 4;
  const focus_x = light_field_width * light_field_pointer_x;
  const focus_y = light_field_height * light_field_pointer_y;
  const field_radius = Math.min(light_field_width, light_field_height) * 0.26 + calm_breath;

  // Draw two related lobes so the field reads as light transport, not decoration.
  _draw_interference_lobe(light_field_context, focus_x, focus_y, field_radius, -0.12);
  _draw_interference_lobe(
    light_field_context,
    focus_x + field_radius * 0.16,
    focus_y - field_radius * 0.08,
    field_radius * 0.7,
    0.34,
  );

  // Finish the optical field with one low-energy spectral focus.
  const focus_glow = light_field_context.createRadialGradient(
    focus_x,
    focus_y,
    0,
    focus_x,
    focus_y,
    field_radius * 0.52,
  );
  focus_glow.addColorStop(0, "rgba(120, 154, 161, 0.065)");
  focus_glow.addColorStop(1, "rgba(120, 154, 161, 0)");
  light_field_context.fillStyle = focus_glow;
  light_field_context.fillRect(0, 0, light_field_width, light_field_height);

  // Keep sparse bamboo leaves near the exact pointer as the ambient natural layer.
  const pointer_x = light_field_width * light_field_target_x;
  const pointer_y = light_field_height * light_field_target_y;
  _render_bamboo_leaves(light_field_context, delta_seconds, pointer_x, pointer_y);

  // Place the brighter sword signature above the leaves in the same animation loop.
  _render_sword_effect(light_field_context, delta_seconds, pointer_x, pointer_y);

  // Keep animating only while a pointer effect still has meaningful motion.
  const should_continue_rendering = (
    !reduced_motion_query.matches
    && (
      light_field_pointer_active
      || bamboo_leaves.length > 0
      || sword_mode !== "dormant"
    )
  );
  if (should_continue_rendering) {
    _request_light_field_frame();
  }
}

/**
 * Restart the light-field renderer after the operating-system motion setting changes.
 *
 * @param {MediaQueryListEvent} event - Change event for the reduced-motion
 *   media query. The `matches` property indicates whether animation must stop.
 * @returns {void} The function returns no value. It cancels an existing frame,
 *   recenters the field for reduced motion, and renders the appropriate state.
 * @throws {Error} This handler does not throw when canvas is unavailable.
 * @example
 * reduced_motion_query.addEventListener("change", _handle_motion_preference_change);
 */
function _handle_motion_preference_change(event) {
  // Cancel the current loop before switching between animated and static modes.
  window.cancelAnimationFrame(light_field_animation_frame);
  light_field_animation_frame = 0;

  // Reset the optical focus only when a stable presentation is requested.
  if (event.matches) {
    light_field_target_x = 0.52;
    light_field_target_y = 0.46;
    light_field_pointer_x = light_field_target_x;
    light_field_pointer_y = light_field_target_y;
    light_field_pointer_active = false;
    bamboo_leaves.length = 0;
    bamboo_leaf_spawn_elapsed = 0;
    _reset_sword_effect();
  }

  // Restart timing from the next frame so preference changes never create a jump.
  bamboo_leaf_previous_timestamp = 0;

  // Draw immediately; active pointer effects schedule later frames as needed.
  _request_light_field_frame(true);
}

/**
 * Initialize responsive canvas sizing, pointer input, and motion-preference handling.
 *
 * @returns {void} The function returns no value. It registers window, document,
 *   and media-query listeners, allocates the canvas bitmap, and begins the
 *   renderer.
 * @throws {Error} No error is raised when canvas support is absent; initialization
 *   exits early so navigation and content remain fully functional.
 * @example
 * _initialize_light_field();
 */
function _initialize_light_field() {
  // Keep the HTML prototype usable in browsers without a 2D canvas context.
  if (!light_field_canvas || !light_field_context) {
    return;
  }

  // Register the inputs that can legitimately change geometry or pointer effects.
  window.addEventListener("resize", _resize_light_field, { passive: true });
  window.addEventListener("pointermove", _update_pointer_target, { passive: true });
  document.documentElement.addEventListener("pointerleave", _deactivate_pointer_effects);
  reduced_motion_query.addEventListener("change", _handle_motion_preference_change);

  // Allocate the bitmap; resizing requests exactly one initial resting frame.
  _resize_light_field();
}

// Start the single authored interaction after the deferred script has parsed.
_initialize_light_field();

"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const expected_sword_wheel_count = 16;
const expected_sword_trail_count = 6;
const expected_sword_guard_anchor_ratio = 0.255;
const expected_sword_formation_arrival_interval = 0.2244;
const expected_maximum_path_length = 760;
const expected_maximum_path_sample_count = 768;

/**
 * Read the animation state exposed by the prototype's classic script.
 *
 * @param {import("playwright").Page} page - Loaded Playwright page whose main
 *   world contains the flying-sword globals. It must remain open during the
 *   evaluation.
 * @returns {Promise<object>} A promise resolving to serializable mode, pointer,
 *   wheel, trail-identity, metrics, and persistent-entity values from one frame.
 * @throws {Error} Playwright raises if the page closes or the prototype script
 *   has not finished evaluating.
 * @example
 * const state = await _read_sword_state(page);
 */
async function _read_sword_state(page) {
  // Read all transition values together so assertions observe one coherent frame.
  return page.evaluate(`(() => {
    const metrics = _get_sword_metrics();
    return {
      pointer_active: light_field_pointer_active,
      mode: sword_mode,
      pointer_speed: sword_pointer_speed,
      trail_rotation: sword_trail_rotation,
      trail_spacing: sword_trail_spacing,
      wheel_rotation: sword_wheel_rotation,
      wheel_center_x: sword_wheel_center_x,
      wheel_center_y: sword_wheel_center_y,
      formation_elapsed: sword_formation_elapsed,
      formation_entry_angle: sword_formation_entry_angle,
      formation_arrival_interval: sword_formation_arrival_interval,
      formation_procession_spacing: sword_formation_procession_spacing,
      transition_elapsed: sword_trail_transition_elapsed,
      extraction_stagger_interval: sword_extraction_stagger_interval,
      extraction_position_response: sword_extraction_position_response,
      breakout_leader_index: sword_breakout_leader_index,
      seconds_since_motion: sword_seconds_since_motion,
      target_x: light_field_target_x,
      target_y: light_field_target_y,
      field_width: light_field_width,
      field_height: light_field_height,
      wheel_radius: metrics.wheel_radius,
      base_height: metrics.base_height,
      bounding_radius: metrics.bounding_radius,
      breakout_speed: metrics.breakout_speed,
      path_sample_count: sword_trail_path_samples.length,
      path_span: sword_trail_path_samples.length > 1
        ? sword_trail_path_samples.at(-1).distance - sword_trail_path_samples[0].distance
        : 0,
      path_samples: sword_trail_path_samples.map((sample) => ({ ...sample })),
      pair_spacings: [...sword_trail_pair_spacings],
      trail_arc_distances: [...sword_trail_arc_distances],
      trail_targets: sword_trail_target_samples.map((sample) => ({ ...sample })),
      trail_ids: [...sword_trail_entity_indices],
      formation_order: [...sword_formation_entity_indices],
      entities: sword_entities.map((sword) => ({
        id: sword.id,
        x: sword.x,
        y: sword.y,
        rotation: sword.rotation,
        opacity: sword.opacity,
        height_scale: sword.height_scale,
        slot_index: sword.slot_index,
        formation_index: sword.formation_index,
      })),
    };
  })()`);
}

/**
 * Move the real browser pointer along a timed linear path.
 *
 * @param {import("playwright").Page} page - Active Playwright page receiving
 *   the pointer events.
 * @param {{x: number, y: number}} start - Finite starting viewport coordinate.
 * @param {{x: number, y: number}} end - Finite ending viewport coordinate.
 * @param {number} duration_ms - Positive total motion duration in milliseconds.
 * @param {number} steps - Positive integer event count; values below one are invalid.
 * @returns {Promise<void>} A promise resolving after the final event and delay.
 * @throws {Error} Playwright raises if the page closes during pointer input.
 * @example
 * await _move_pointer_path(page, { x: 100, y: 100 }, { x: 300, y: 100 }, 500, 20);
 *
 * @sideEffects Dispatches pointer movement and waits for real animation frames.
 */
async function _move_pointer_path(page, start, end, duration_ms, steps) {
  // Emit bounded, evenly timed events so velocity thresholds are deterministic.
  const step_delay = duration_ms / steps;
  for (let motion_step = 1; motion_step <= steps; motion_step += 1) {
    const motion_progress = motion_step / steps;
    await page.mouse.move(
      start.x + (end.x - start.x) * motion_progress,
      start.y + (end.y - start.y) * motion_progress,
    );
    await page.waitForTimeout(step_delay);
  }
}

/**
 * Sample persistent sword state on consecutive animation frames.
 *
 * @param {import("playwright").Page} page - Active Playwright page whose main
 *   world contains the sword globals.
 * @param {number} duration_ms - Positive sampling duration in milliseconds.
 * @returns {Promise<object[]>} Consecutive frame snapshots containing mode,
 *   wheel phase, pointer location, trail IDs, metrics, and all configured entities.
 * @throws {Error} Playwright raises if evaluation is interrupted or the page closes.
 * @example
 * const frames = await _sample_sword_frames(page, 500);
 *
 * @sideEffects Waits for animation frames and performs read-only page evaluation.
 */
async function _sample_sword_frames(page, duration_ms) {
  // Sample in the page's own rAF cadence so one-frame discontinuities remain visible.
  return page.evaluate((sample_duration_ms) => new Promise((resolve) => {
    const samples = [];
    const started_at = performance.now();
    const sample_frame = (timestamp) => {
      const metrics = _get_sword_metrics();
      samples.push({
        timestamp,
        mode: sword_mode,
        pointer_speed: sword_pointer_speed,
        breakout_sample_count: sword_breakout_sample_count,
        wheel_rotation: sword_wheel_rotation,
        trail_rotation: sword_trail_rotation,
        trail_spacing: sword_trail_spacing,
        wheel_center_x: sword_wheel_center_x,
        wheel_center_y: sword_wheel_center_y,
        formation_elapsed: sword_formation_elapsed,
        formation_entry_angle: sword_formation_entry_angle,
        formation_arrival_interval: sword_formation_arrival_interval,
        formation_procession_spacing: sword_formation_procession_spacing,
        transition_elapsed: sword_trail_transition_elapsed,
        extraction_stagger_interval: sword_extraction_stagger_interval,
        extraction_position_response: sword_extraction_position_response,
        breakout_leader_index: sword_breakout_leader_index,
        pointer_x: light_field_target_x * light_field_width,
        pointer_y: light_field_target_y * light_field_height,
        wheel_radius: metrics.wheel_radius,
        base_height: metrics.base_height,
        bounding_radius: metrics.bounding_radius,
        breakout_speed: metrics.breakout_speed,
        path_sample_count: sword_trail_path_samples.length,
        path_span: sword_trail_path_samples.length > 1
          ? sword_trail_path_samples.at(-1).distance - sword_trail_path_samples[0].distance
          : 0,
        pair_spacings: [...sword_trail_pair_spacings],
        trail_arc_distances: [...sword_trail_arc_distances],
        trail_targets: sword_trail_target_samples.map((sample) => ({ ...sample })),
        trail_ids: [...sword_trail_entity_indices],
        formation_order: [...sword_formation_entity_indices],
        entities: sword_entities.map((sword) => ({
          id: sword.id,
          x: sword.x,
          y: sword.y,
          rotation: sword.rotation,
          opacity: sword.opacity,
          height_scale: sword.height_scale,
          slot_index: sword.slot_index,
          formation_index: sword.formation_index,
        })),
      });
      if (timestamp - started_at >= sample_duration_ms) {
        resolve(samples);
        return;
      }
      requestAnimationFrame(sample_frame);
    };
    requestAnimationFrame(sample_frame);
  }), duration_ms);
}

/**
 * Exercise moving, stationary, resumed, and reduced-motion sword states.
 *
 * @returns {Promise<number>} A promise resolving to process status `0` after
 *   all assertions and screenshots complete successfully.
 * @throws {AssertionError} Raised when a transition fails to reach its expected
 *   bounded state.
 * @throws {Error} Playwright raises when Chrome cannot launch, the local page
 *   cannot load, or a screenshot cannot be written.
 * @example
 * void main();
 *
 * @sideEffects Launches headless Chrome and writes three PNG evidence images in
 *   the prototype's existing `test-artifacts` directory.
 */
async function main() {
  // Resolve explicit local inputs without requiring an HTTP server.
  const chrome_path = process.argv[2];
  assert(chrome_path, "Chrome executable path is required as the first argument");
  const prototype_root = path.resolve(__dirname, "..");
  const prototype_url = pathToFileURL(path.join(prototype_root, "index.html")).href;
  const artifact_root = path.join(prototype_root, "test-artifacts");

  // Launch one browser and capture unexpected page failures for the final check.
  const browser = await chromium.launch({ executablePath: chrome_path, headless: true });
  const browser_errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("console", (message) => {
      if (message.type() === "error") {
        browser_errors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => browser_errors.push(`pageerror: ${error.message}`));
    await page.goto(prototype_url, { waitUntil: "load" });
    await page.waitForFunction(() => {
      const image = document.querySelector("#sword-asset");
      return image?.complete && image.naturalWidth > 0;
    });

    // Establish a low-speed six-sword queue, then accelerate it into a longer wake.
    const initial_start = { x: 360, y: 540 };
    const low_sample_start = { x: 400, y: 530 };
    const low_sample_end = { x: 480, y: 505 };
    const straight_high_end = { x: 900, y: 650 };
    const curve_start = { x: 300, y: 700 };
    const curve_corner = { x: 950, y: 700 };
    const formation_anchor = { x: 950, y: 350 };
    await page.mouse.move(initial_start.x, initial_start.y);
    await page.waitForTimeout(50);
    const initial_activation_state = await _read_sword_state(page);
    const initial_forward_x = -Math.sin(initial_activation_state.trail_rotation);
    const initial_forward_y = Math.cos(initial_activation_state.trail_rotation);
    const initial_trail_entities = initial_activation_state.trail_ids.map((sword_id) => (
      initial_activation_state.entities.find((sword_entity) => sword_entity.id === sword_id)
    ));
    assert.equal(initial_activation_state.mode, "trailing", "first activation should enter trail mode");
    assert.equal(
      initial_trail_entities.length,
      expected_sword_trail_count,
      "first activation should seed all six persistent trail identities",
    );
    for (let trail_index = 1; trail_index < initial_trail_entities.length; trail_index += 1) {
      const preceding_sword = initial_trail_entities[trail_index - 1];
      const following_sword = initial_trail_entities[trail_index];
      const longitudinal_gap = (
        (preceding_sword.x - following_sword.x) * initial_forward_x
          + (preceding_sword.y - following_sword.y) * initial_forward_y
      );
      const occupied_length = initial_activation_state.base_height * (
        preceding_sword.height_scale * expected_sword_guard_anchor_ratio
          + following_sword.height_scale * (1 - expected_sword_guard_anchor_ratio)
      );
      assert(
        longitudinal_gap - occupied_length >= initial_activation_state.base_height * 0.075,
        "first activation should never reveal overlapping adjacent sword sprites",
      );
    }
    await _move_pointer_path(page, initial_start, low_sample_start, 300, 15);
    const low_sampling_promise = _sample_sword_frames(page, 940);
    await _move_pointer_path(page, low_sample_start, low_sample_end, 920, 46);
    const low_trail_frames = await low_sampling_promise;
    const high_sampling_promise = _sample_sword_frames(page, 520);
    await _move_pointer_path(page, low_sample_end, straight_high_end, 500, 30);
    const high_trail_frames = await high_sampling_promise;
    const moving_state = await _read_sword_state(page);
    const original_trail_ids = [...moving_state.trail_ids];
    const moving_visible_count = moving_state.entities.filter((sword) => sword.opacity > 0.12).length;
    assert(moving_state.pointer_active, "fine pointer should activate the effect");
    assert.equal(moving_state.mode, "trailing", "deliberate travel should use trail mode");
    assert.equal(
      moving_visible_count,
      expected_sword_trail_count,
      "travel should expose exactly six persistent swords",
    );
    assert.equal(
      new Set(original_trail_ids).size,
      expected_sword_trail_count,
      "trail identities should be unique",
    );
    assert.deepEqual(
      original_trail_ids,
      moving_state.formation_order.slice(0, expected_sword_trail_count),
      "the same permanent queue head should lead both trail and wheel",
    );

    // Select stable low- and high-speed frames using the effect's own responsive threshold.
    const first_low_timestamp = low_trail_frames[0].timestamp;
    const first_high_timestamp = high_trail_frames[0].timestamp;
    const steady_low_frames = low_trail_frames.filter((frame) => (
      frame.mode === "trailing"
      && frame.timestamp - first_low_timestamp >= 180
      && frame.pointer_speed >= frame.breakout_speed * 0.03
      && frame.pointer_speed <= frame.breakout_speed * 0.2
    ));
    const steady_high_frames = high_trail_frames.filter((frame) => (
      frame.mode === "trailing"
      && frame.timestamp - first_high_timestamp >= 150
      && frame.pointer_speed >= frame.breakout_speed * 0.38
    ));
    assert(
      steady_low_frames.length >= 10,
      `low-speed spacing needs ten steady frames: ${JSON.stringify(low_trail_frames.map((frame) => Math.round(frame.pointer_speed)))}`,
    );
    assert(
      steady_high_frames.length >= 10,
      `high-speed spacing needs ten steady frames: ${JSON.stringify(high_trail_frames.map((frame) => Math.round(frame.pointer_speed)))}`,
    );

    // Verify both speed bands preserve identity, local path tangency, and sprite clearance.
    const low_pair_gaps = Array.from({ length: expected_sword_trail_count - 1 }, () => []);
    const high_pair_gaps = Array.from({ length: expected_sword_trail_count - 1 }, () => []);
    const low_total_spans = [];
    const high_total_spans = [];
    const speed_frame_groups = [
      { frames: steady_low_frames, pair_gaps: low_pair_gaps, total_spans: low_total_spans },
      { frames: steady_high_frames, pair_gaps: high_pair_gaps, total_spans: high_total_spans },
    ];
    for (const frame_group of speed_frame_groups) {
      for (const frame of frame_group.frames) {
        assert.deepEqual(frame.trail_ids, original_trail_ids, "speed changes must preserve sword order");
        assert.equal(
          frame.entities.filter((sword) => sword.opacity > 0.12).length,
          expected_sword_trail_count,
          "every trail speed should keep exactly six visible swords",
        );
        assert(
          frame.path_sample_count <= expected_maximum_path_sample_count,
          "trail history should remain within its sample-count cap",
        );
        assert(
          frame.path_span <= expected_maximum_path_length + 0.01,
          "trail history should remain within its arc-length cap",
        );
        for (let trail_index = 0; trail_index < frame.trail_ids.length; trail_index += 1) {
          const sword_entity = frame.entities.find((sword) => (
            sword.id === frame.trail_ids[trail_index]
          ));
          const target_sample = frame.trail_targets[trail_index];
          const rotation_error = Math.abs(Math.atan2(
            Math.sin(sword_entity.rotation - target_sample.rotation),
            Math.cos(sword_entity.rotation - target_sample.rotation),
          ));
          const target_error = Math.hypot(
            sword_entity.x - target_sample.x,
            sword_entity.y - target_sample.y,
          );
          assert(rotation_error < 0.03, "each moving sword should use its own local path tangent");
          assert(target_error < 0.5, "each moving sword guard should lie on its sampled path point");
        }
        for (let trail_index = 1; trail_index < frame.trail_ids.length; trail_index += 1) {
          const preceding_sword = frame.entities.find((sword) => (
            sword.id === frame.trail_ids[trail_index - 1]
          ));
          const following_sword = frame.entities.find((sword) => (
            sword.id === frame.trail_ids[trail_index]
          ));
          const pair_spacing = frame.pair_spacings[trail_index - 1];
          const realized_arc_gap = (
            frame.trail_arc_distances[trail_index]
            - frame.trail_arc_distances[trail_index - 1]
          );
          const preceding_handle_extent = (
            frame.base_height * preceding_sword.height_scale * expected_sword_guard_anchor_ratio
          );
          const following_blade_extent = (
            frame.base_height * following_sword.height_scale
              * (1 - expected_sword_guard_anchor_ratio)
          );
          const sprite_clearance = (
            pair_spacing - preceding_handle_extent - following_blade_extent
          );
          assert(
            sprite_clearance >= frame.base_height * 0.075,
            "adjacent sword sprites should retain a visible gap along the curve",
          );
          assert(Math.abs(realized_arc_gap - pair_spacing) < 0.01, "pair lag should equal its arc gap");
          assert(
            preceding_sword.opacity - following_sword.opacity > 0.05,
            "ordered followers should fade progressively with distance",
          );
          frame_group.pair_gaps[trail_index - 1].push(pair_spacing);
        }
        frame_group.total_spans.push(frame.trail_arc_distances.at(-1));
      }
    }

    // High speed must stretch each pair and the complete six-sword wake materially.
    for (let pair_index = 0; pair_index < low_pair_gaps.length; pair_index += 1) {
      const sorted_low_gaps = [...low_pair_gaps[pair_index]].sort((a, b) => a - b);
      const sorted_high_gaps = [...high_pair_gaps[pair_index]].sort((a, b) => a - b);
      const low_median_gap = sorted_low_gaps[Math.floor(sorted_low_gaps.length / 2)];
      const high_median_gap = sorted_high_gaps[Math.floor(sorted_high_gaps.length / 2)];
      assert(
        high_median_gap >= low_median_gap + moving_state.base_height * 0.2,
        `high speed pair ${pair_index} should add visible space: ${(
          high_median_gap - low_median_gap
        ).toFixed(2)}px for ${moving_state.base_height.toFixed(2)}px swords`,
      );
      assert(high_median_gap >= low_median_gap * 1.14, "high speed should lengthen the queue");
    }
    const sorted_low_spans = [...low_total_spans].sort((a, b) => a - b);
    const sorted_high_spans = [...high_total_spans].sort((a, b) => a - b);
    const low_median_span = sorted_low_spans[Math.floor(sorted_low_spans.length / 2)];
    const high_median_span = sorted_high_spans[Math.floor(sorted_high_spans.length / 2)];
    assert(
      high_median_span >= low_median_span + moving_state.base_height * 1.2,
      "high speed should visibly lengthen the complete six-sword wake",
    );

    // Drive a right-angle path so the leader turns upward while the tail remains horizontal.
    await _move_pointer_path(page, straight_high_end, curve_start, 420, 42);
    await _move_pointer_path(page, curve_start, curve_corner, 620, 62);
    const curve_sampling_promise = _sample_sword_frames(page, 650);
    await _move_pointer_path(page, curve_corner, formation_anchor, 300, 30);
    const curve_frames = await curve_sampling_promise;
    const curve_frame = curve_frames.filter((frame) => (
      frame.mode === "trailing"
      && frame.pointer_y < curve_corner.y - 250
    )).at(-1);
    assert(curve_frame, "the path test should sample the leader deep into the second leg");
    const curve_entities = curve_frame.trail_ids.map((sword_id) => (
      curve_frame.entities.find((sword_entity) => sword_entity.id === sword_id)
    ));
    const curve_leader = curve_entities[0];
    const curve_tail = curve_entities.at(-1);
    const leader_tail_rotation_difference = Math.abs(Math.atan2(
      Math.sin(curve_leader.rotation - curve_tail.rotation),
      Math.cos(curve_leader.rotation - curve_tail.rotation),
    ));
    assert(
      leader_tail_rotation_difference > 0.75,
      "leader and tail should retain different local tangents across a real turn",
    );

    // Require an intermediate sword to occupy the bend instead of a rigid leader-tail line.
    const leader_tail_x = curve_tail.x - curve_leader.x;
    const leader_tail_y = curve_tail.y - curve_leader.y;
    const leader_tail_length = Math.max(1, Math.hypot(leader_tail_x, leader_tail_y));
    const middle_line_distances = curve_entities.slice(1, -1).map((sword_entity) => Math.abs(
      leader_tail_x * (curve_leader.y - sword_entity.y)
      - (curve_leader.x - sword_entity.x) * leader_tail_y
    ) / leader_tail_length);
    assert(
      Math.max(...middle_line_distances) > curve_frame.base_height * 0.3,
      "a middle sword should visibly occupy the curve away from the endpoint chord",
    );

    // Prove every guard uses the same bounded path with strictly ordered arc lags.
    for (let trail_index = 0; trail_index < curve_entities.length; trail_index += 1) {
      const sword_entity = curve_entities[trail_index];
      const target_sample = curve_frame.trail_targets[trail_index];
      assert(
        Math.hypot(sword_entity.x - target_sample.x, sword_entity.y - target_sample.y) < 0.5,
        `curve sword ${sword_entity.id} should remain on its arc-length target`,
      );
      if (trail_index > 0) {
        assert(
          curve_frame.trail_arc_distances[trail_index]
            > curve_frame.trail_arc_distances[trail_index - 1],
          "followers should remain strictly ordered from path head to tail",
        );
      }
    }
    assert(
      curve_frame.path_sample_count <= expected_maximum_path_sample_count
        && curve_frame.path_span <= expected_maximum_path_length + 0.01,
      "curved pointer travel should not exceed retained history bounds",
    );

    // Sample the complete procession while capturing its intentionally partial midpoint.
    const formation_sampling_promise = _sample_sword_frames(page, 4500);
    await page.waitForTimeout(780);
    await page.screenshot({
      path: path.join(artifact_root, "sword-forming.png"),
      clip: {
        x: formation_anchor.x - 270,
        y: formation_anchor.y - 210,
        width: 540,
        height: 420,
      },
    });
    const formation_frames = await formation_sampling_promise;
    const first_forming_index = formation_frames.findIndex((frame) => frame.mode === "forming");
    assert(first_forming_index >= 0, "stationary trail should enter direct formation");
    const first_forming_frame = formation_frames[first_forming_index];
    assert.equal(
      first_forming_frame.entities.length,
      expected_sword_wheel_count,
      "the wheel should own sixteen persistent sword entities",
    );
    assert.equal(
      new Set(first_forming_frame.entities.map((sword) => sword.id)).size,
      expected_sword_wheel_count,
      "all sixteen persistent sword identities should be unique",
    );
    assert.equal(
      new Set(first_forming_frame.formation_order).size,
      expected_sword_wheel_count,
      "formation order should contain sixteen unique persistent identities",
    );
    assert(
      Math.abs(
        first_forming_frame.formation_arrival_interval
          - expected_sword_formation_arrival_interval,
      ) < 0.001,
      "sixteen-sword formation should preserve the approved 224ms arrival cadence",
    );
    assert.deepEqual(
      first_forming_frame.formation_order.slice(0, expected_sword_trail_count),
      original_trail_ids,
      "the six moving swords should keep their order when entering the wheel",
    );
    for (let formation_index = 1;
      formation_index < expected_sword_wheel_count;
      formation_index += 1) {
      const preceding_entity = first_forming_frame.entities.find((sword) => (
        sword.id === first_forming_frame.formation_order[formation_index - 1]
      ));
      const following_entity = first_forming_frame.entities.find((sword) => (
        sword.id === first_forming_frame.formation_order[formation_index]
      ));
      assert.equal(
        following_entity.slot_index,
        (preceding_entity.slot_index - 1 + expected_sword_wheel_count)
          % expected_sword_wheel_count,
        "ordered swords should occupy consecutive slots behind the leader",
      );
    }

    // Keep one actual gate fixed in wheel-local space throughout the procession.
    for (const frame of formation_frames.filter((sample) => sample.mode === "forming")) {
      const entry_angle_drift = Math.abs(Math.atan2(
        Math.sin(frame.formation_entry_angle - first_forming_frame.formation_entry_angle),
        Math.cos(frame.formation_entry_angle - first_forming_frame.formation_entry_angle),
      ));
      const center_drift = Math.hypot(
        frame.wheel_center_x - first_forming_frame.wheel_center_x,
        frame.wheel_center_y - first_forming_frame.wheel_center_y,
      );
      assert(entry_angle_drift < 0.02, "formation entry direction should remain fixed");
      assert(
        center_drift < first_forming_frame.wheel_radius * 0.05,
        "stationary formation should not move its wheel center",
      );
    }

    // Preserve the original six throughout the queue-to-wheel handoff.
    for (const frame of formation_frames) {
      const visible_count = frame.entities.filter((sword) => sword.opacity > 0.12).length;
      assert(
        visible_count >= expected_sword_trail_count,
        "formation must never lose the original six visible swords",
      );
      for (const sword_id of original_trail_ids) {
        const sword_entity = frame.entities.find((sword) => sword.id === sword_id);
        assert(sword_entity.opacity > 0.12, `forming sword ${sword_id} must remain visible`);
      }
    }

    // Admit every hidden wheel identity in order, with no grouped reveal.
    const hidden_sword_ids = first_forming_frame.formation_order.slice(expected_sword_trail_count);
    assert.equal(
      hidden_sword_ids.length,
      expected_sword_wheel_count - expected_sword_trail_count,
      "formation should queue all ten identities not already visible in the trail",
    );
    const reveal_records = hidden_sword_ids.map((sword_id) => {
      const reveal_frame_index = formation_frames.findIndex((frame) => {
        const sword_entity = frame.entities.find((sword) => sword.id === sword_id);
        return frame.mode === "forming" && sword_entity.opacity > 0.12;
      });
      assert(reveal_frame_index >= 0, `ordered sword ${sword_id} should reveal during formation`);
      return {
        sword_id,
        frame_index: reveal_frame_index,
        timestamp: formation_frames[reveal_frame_index].timestamp,
      };
    });
    for (let reveal_index = 1; reveal_index < reveal_records.length; reveal_index += 1) {
      assert(
        reveal_records[reveal_index].timestamp - reveal_records[reveal_index - 1].timestamp > 110,
        "successive hidden swords should appear on separate beats",
      );
      assert(
        reveal_records[reveal_index].frame_index > reveal_records[reveal_index - 1].frame_index,
        "hidden swords should reveal strictly in formation order",
      );
    }
    for (const reveal_record of reveal_records) {
      for (const frame of formation_frames.slice(reveal_record.frame_index)) {
        if (frame.mode !== "forming") {
          continue;
        }
        const sword_entity = frame.entities.find((sword) => sword.id === reveal_record.sword_id);
        assert(
          sword_entity.opacity > 0.12,
          `revealed sword ${reveal_record.sword_id} should remain visible through seating`,
        );
      }
    }
    for (let frame_index = 1; frame_index < formation_frames.length; frame_index += 1) {
      const previous_visible_ids = new Set(
        formation_frames[frame_index - 1].entities
          .filter((sword) => sword.opacity > 0.12)
          .map((sword) => sword.id),
      );
      const newly_visible_count = formation_frames[frame_index].entities.filter((sword) => (
        sword.opacity > 0.12 && !previous_visible_ids.has(sword.id)
      )).length;
      const frame_delta_seconds = (
        formation_frames[frame_index].timestamp - formation_frames[frame_index - 1].timestamp
      ) / 1000;
      const allowed_newly_visible_count = Math.max(
        1,
        Math.ceil(frame_delta_seconds / formation_frames[frame_index].formation_arrival_interval),
      );
      assert(
        newly_visible_count <= allowed_newly_visible_count,
        "normal animation frames may reveal only one ordered sword",
      );
    }

    // Verify every ordered identity passes close to the same fixed wheel entry gate.
    for (let formation_index = 0;
      formation_index < expected_sword_wheel_count;
      formation_index += 1) {
      const sword_id = first_forming_frame.formation_order[formation_index];
      const arrival_time = formation_index * first_forming_frame.formation_arrival_interval;
      const arrival_candidates = formation_frames.filter((frame) => (
        frame.mode === "forming"
        && Math.abs(frame.formation_elapsed - arrival_time) <= 0.11
      ));
      assert(arrival_candidates.length > 0, `sword ${sword_id} needs sampled entry frames`);
      const closest_entry = arrival_candidates.reduce((closest_record, frame) => {
        const sword_entity = frame.entities.find((sword) => sword.id === sword_id);
        const entry_x = (
          frame.wheel_center_x + Math.cos(frame.formation_entry_angle) * frame.wheel_radius
        );
        const entry_y = (
          frame.wheel_center_y + Math.sin(frame.formation_entry_angle) * frame.wheel_radius
        );
        const entry_distance = Math.hypot(sword_entity.x - entry_x, sword_entity.y - entry_y);
        return entry_distance < closest_record.distance
          ? { distance: entry_distance, frame, sword_entity }
          : closest_record;
      }, { distance: Number.POSITIVE_INFINITY, frame: null, sword_entity: null });
      assert(
        closest_entry.distance < first_forming_frame.wheel_radius * 0.35,
        `sword ${sword_id} should pass through the shared entry gate`,
      );
      const entry_rotation = closest_entry.frame.formation_entry_angle - Math.PI / 2;
      const rotation_error = Math.abs(Math.atan2(
        Math.sin(closest_entry.sword_entity.rotation - entry_rotation),
        Math.cos(closest_entry.sword_entity.rotation - entry_rotation),
      ));
      assert(rotation_error < 0.3, `sword ${sword_id} should face along the shared entry`);
      assert(
        closest_entry.sword_entity.opacity > 0.12,
        `sword ${sword_id} should be visible while crossing the shared entry`,
      );
    }

    // Confirm seats fill in queue order instead of allowing an early radial expansion.
    const slot_step = Math.PI * 2 / expected_sword_wheel_count;
    const first_seated_records = first_forming_frame.formation_order.map((sword_id) => {
      const seated_frame_index = formation_frames.findIndex((frame) => {
        if (frame.mode !== "forming") {
          return false;
        }
        const sword_entity = frame.entities.find((sword) => sword.id === sword_id);
        const slot_angle = frame.wheel_rotation + sword_entity.slot_index * slot_step;
        const slot_x = frame.wheel_center_x + Math.cos(slot_angle) * frame.wheel_radius;
        const slot_y = frame.wheel_center_y + Math.sin(slot_angle) * frame.wheel_radius;
        const rotation_error = Math.abs(Math.atan2(
          Math.sin(sword_entity.rotation - slot_angle + Math.PI / 2),
          Math.cos(sword_entity.rotation - slot_angle + Math.PI / 2),
        ));
        return (
          sword_entity.opacity > 0.12
          && Math.hypot(sword_entity.x - slot_x, sword_entity.y - slot_y)
            < frame.wheel_radius * 0.22
          && rotation_error < 0.25
        );
      });
      assert(seated_frame_index >= 0, `sword ${sword_id} should visibly take its wheel seat`);
      return {
        sword_id,
        frame_index: seated_frame_index,
        timestamp: formation_frames[seated_frame_index].timestamp,
      };
    });
    for (let seated_index = 1; seated_index < first_seated_records.length; seated_index += 1) {
      assert(
        first_seated_records[seated_index].frame_index
          > first_seated_records[seated_index - 1].frame_index,
        "wheel seats should become occupied strictly in formation order",
      );
      assert(
        first_seated_records[seated_index].timestamp
          - first_seated_records[seated_index - 1].timestamp > 110,
        "successive wheel seats should fill on distinct formation beats",
      );
    }
    assert(
      first_seated_records.at(-1).timestamp - first_seated_records[0].timestamp > 1600,
      "the complete wheel should visibly assemble over multiple ordered beats",
    );
    for (const frame of formation_frames.filter((sample) => sample.mode === "forming")) {
      const seated_count = frame.entities.filter((sword_entity) => {
        const slot_angle = frame.wheel_rotation + sword_entity.slot_index * slot_step;
        const slot_x = frame.wheel_center_x + Math.cos(slot_angle) * frame.wheel_radius;
        const slot_y = frame.wheel_center_y + Math.sin(slot_angle) * frame.wheel_radius;
        const rotation_error = Math.abs(Math.atan2(
          Math.sin(sword_entity.rotation - slot_angle + Math.PI / 2),
          Math.cos(sword_entity.rotation - slot_angle + Math.PI / 2),
        ));
        return (
          sword_entity.opacity > 0.12
          && Math.hypot(sword_entity.x - slot_x, sword_entity.y - slot_y)
            < frame.wheel_radius * 0.22
          && rotation_error < 0.25
        );
      }).length;
      const allowed_seated_count = Math.min(
        expected_sword_wheel_count,
        1 + Math.floor(
          (frame.formation_elapsed + 0.06) / frame.formation_arrival_interval,
        ),
      );
      assert(
        seated_count <= allowed_seated_count,
        "formation clock should never seat multiple future swords early",
      );
    }

    // Bound every visible normal-frame pose change so ordered motion never hides a teleport.
    for (let frame_index = 1; frame_index < formation_frames.length; frame_index += 1) {
      const previous_frame = formation_frames[frame_index - 1];
      const current_frame = formation_frames[frame_index];
      if (current_frame.timestamp - previous_frame.timestamp > 25) {
        continue;
      }
      for (const current_sword of current_frame.entities.filter((sword) => sword.opacity > 0.12)) {
        const previous_sword = previous_frame.entities.find((sword) => (
          sword.id === current_sword.id
        ));
        if (previous_sword.opacity <= 0.12) {
          continue;
        }
        const position_step = Math.hypot(
          current_sword.x - previous_sword.x,
          current_sword.y - previous_sword.y,
        );
        const rotation_step = Math.abs(Math.atan2(
          Math.sin(current_sword.rotation - previous_sword.rotation),
          Math.cos(current_sword.rotation - previous_sword.rotation),
        ));
        assert(
          position_step < current_frame.wheel_radius * 0.35,
          `formation position must be continuous for sword ${current_sword.id}: ${position_step.toFixed(2)}`,
        );
        assert(rotation_step < 0.3, "formation rotation must use the shortest continuous arc");
        assert(
          Math.abs(current_sword.height_scale - previous_sword.height_scale) < 0.08,
          "formation scale must remain continuous",
        );
      }
    }
    const next_forming_frame = formation_frames[first_forming_index + 1];
    assert(next_forming_frame, "formation should span more than one animation frame");
    assert.notEqual(
      first_forming_frame.wheel_rotation,
      next_forming_frame.wheel_rotation,
      "wheel should rotate from the first formation frame",
    );

    // Confirm the completed sixteen-sword wheel remains fully visible and rotating.
    const settled_state = await _read_sword_state(page);
    const settled_visible_count = settled_state.entities.filter((sword) => sword.opacity > 0.12).length;
    assert.equal(settled_state.mode, "orbiting", "completed formation should enter orbiting mode");
    assert.equal(
      settled_visible_count,
      expected_sword_wheel_count,
      "completed wheel should expose all sixteen swords",
    );
    assert.equal(
      new Set(settled_state.entities.map((sword) => sword.slot_index)).size,
      expected_sword_wheel_count,
      "completed wheel should retain sixteen unique occupied slots",
    );
    await page.screenshot({
      path: path.join(artifact_root, "sword-wheel.png"),
      clip: {
        x: formation_anchor.x - 175,
        y: formation_anchor.y - 155,
        width: 350,
        height: 310,
      },
    });

    // Move the pointer slowly farther than two wheel bounds; the whole wheel must follow.
    const slow_states = [];
    const slow_end = { x: 1160, y: formation_anchor.y };
    for (let motion_step = 1; motion_step <= 45; motion_step += 1) {
      const motion_progress = motion_step / 45;
      await page.mouse.move(
        formation_anchor.x + (slow_end.x - formation_anchor.x) * motion_progress,
        formation_anchor.y,
      );
      await page.waitForTimeout(40);
      if (motion_step % 5 === 0) {
        slow_states.push(await _read_sword_state(page));
      }
    }
    assert(
      slow_end.x - formation_anchor.x > settled_state.bounding_radius * 2,
      "slow test path should exceed two visual wheel bounds",
    );
    for (const slow_state of slow_states) {
      const center_gap = Math.hypot(
        slow_state.target_x * slow_state.field_width - slow_state.wheel_center_x,
        slow_state.target_y * slow_state.field_height - slow_state.wheel_center_y,
      );
      assert.equal(slow_state.mode, "orbiting", "slow movement should keep the wheel intact");
      assert(center_gap < slow_state.bounding_radius, "slow wheel center should follow the pointer");
      assert.equal(
        slow_state.entities.filter((sword) => sword.opacity > 0.12).length,
        expected_sword_wheel_count,
        "slow wheel following should keep sixteen visible swords",
      );
    }

    // A fast move that remains inside the visible wheel bound must not trigger escape.
    await page.waitForTimeout(240);
    const before_inner_flick = await _read_sword_state(page);
    const inner_left = {
      x: before_inner_flick.wheel_center_x - before_inner_flick.bounding_radius * 0.55,
      y: before_inner_flick.wheel_center_y,
    };
    const inner_target = {
      x: before_inner_flick.wheel_center_x + before_inner_flick.bounding_radius * 0.72,
      y: before_inner_flick.wheel_center_y,
    };
    await page.mouse.move(inner_left.x, inner_left.y);
    await page.waitForTimeout(8);
    for (let flick_step = 0; flick_step < 6; flick_step += 1) {
      const flick_target = flick_step % 2 === 0 ? inner_target : inner_left;
      await page.mouse.move(flick_target.x, flick_target.y);
      await page.waitForTimeout(8);
    }
    await page.mouse.move(inner_target.x, inner_target.y);
    await page.waitForTimeout(8);
    const inner_flick_state = await _read_sword_state(page);
    assert(
      inner_flick_state.pointer_speed > inner_flick_state.breakout_speed,
      `inner flick speed ${inner_flick_state.pointer_speed.toFixed(1)} should exceed ${inner_flick_state.breakout_speed.toFixed(1)}`,
    );
    assert.equal(inner_flick_state.mode, "orbiting", "speed alone must not break the wheel");

    // Flick beyond the wheel and verify the permanent first sword leads the same order out.
    await page.waitForTimeout(280);
    const before_breakout = await _read_sword_state(page);
    const expected_leader = before_breakout.entities.find((sword_entity) => (
      sword_entity.id === before_breakout.formation_order[0]
    ));
    const non_leader_escape_sword = before_breakout.entities.find((sword_entity) => (
      sword_entity.id === before_breakout.formation_order[5]
    ));
    const escape_direction_x = non_leader_escape_sword.x - before_breakout.wheel_center_x;
    const escape_direction_y = non_leader_escape_sword.y - before_breakout.wheel_center_y;
    const escape_direction_length = Math.max(1, Math.hypot(escape_direction_x, escape_direction_y));
    const breakout_target = {
      x: before_breakout.wheel_center_x
        + escape_direction_x / escape_direction_length * before_breakout.bounding_radius * 2.05,
      y: before_breakout.wheel_center_y
        + escape_direction_y / escape_direction_length * before_breakout.bounding_radius * 2.05,
    };
    const spatially_nearest_sword = before_breakout.entities.reduce(
      (nearest_sword, sword_entity) => {
        const nearest_distance = Math.hypot(
          nearest_sword.x - breakout_target.x,
          nearest_sword.y - breakout_target.y,
        );
        const sword_distance = Math.hypot(
          sword_entity.x - breakout_target.x,
          sword_entity.y - breakout_target.y,
        );
        return sword_distance < nearest_distance ? sword_entity : nearest_sword;
      },
    );
    assert.notEqual(
      spatially_nearest_sword.id,
      expected_leader.id,
      "breakout test must aim away from the fixed queue leader",
    );
    const extraction_follow_target = { x: 850, y: 580 };
    const extraction_sampling_promise = _sample_sword_frames(page, 900);
    await _move_pointer_path(
      page,
      { x: inner_target.x, y: inner_target.y },
      breakout_target,
      30,
      6,
    );
    await _move_pointer_path(page, breakout_target, extraction_follow_target, 850, 43);
    const extraction_frames = await extraction_sampling_promise;
    const first_extraction_index = extraction_frames.findIndex((frame) => (
      frame.mode === "extracting"
    ));
    assert(
      first_extraction_index >= 0,
      `fast boundary escape should enter extraction: ${JSON.stringify(extraction_frames.slice(0, 5).map((frame) => ({ mode: frame.mode, speed: Math.round(frame.pointer_speed), samples: frame.breakout_sample_count, gap: Math.round(Math.hypot(frame.pointer_x - frame.wheel_center_x, frame.pointer_y - frame.wheel_center_y)), bound: Math.round(frame.bounding_radius) })))}`,
    );
    const first_extraction_frame = extraction_frames[first_extraction_index];
    assert.equal(
      first_extraction_frame.breakout_leader_index,
      expected_leader.id,
      "the first sword in permanent order should lead every extraction",
    );
    assert.equal(
      first_extraction_frame.trail_ids[0],
      expected_leader.id,
      "leader identity should occupy the first trail role",
    );
    const extracted_slot_indices = first_extraction_frame.trail_ids.map((sword_id) => (
      first_extraction_frame.entities.find((sword) => sword.id === sword_id).slot_index
    ));
    for (let trail_index = 1; trail_index < extracted_slot_indices.length; trail_index += 1) {
      const expected_slot = (
        extracted_slot_indices[0] - trail_index + expected_sword_wheel_count
      ) % expected_sword_wheel_count;
      assert.equal(
        extracted_slot_indices[trail_index],
        expected_slot,
        "the next five followers should peel from consecutive slots behind the leader",
      );
    }

    // Confirm all six identities peel from the wheel reference path on separate beats.
    const extraction_slot_step = Math.PI * 2 / expected_sword_wheel_count;
    const reference_start_index = first_extraction_index - 1;
    assert(reference_start_index >= 0, "extraction trace should include its final wheel frame");
    const reference_start_frame = extraction_frames[reference_start_index];
    const extraction_references = new Map(first_extraction_frame.trail_ids.map((sword_id) => {
      const sword_entity = reference_start_frame.entities.find((sword) => sword.id === sword_id);
      return [sword_id, { x: sword_entity.x, y: sword_entity.y }];
    }));
    const departure_records = [];
    const departed_sword_ids = new Set();
    for (let frame_index = first_extraction_index;
      frame_index < extraction_frames.length;
      frame_index += 1) {
      const frame = extraction_frames[frame_index];
      if (frame.mode !== "extracting") {
        break;
      }

      // Evolve the path each sword would follow if it remained attached to the wheel.
      const previous_frame = extraction_frames[frame_index - 1];
      const frame_delta_seconds = Math.min(
        Math.max((frame.timestamp - previous_frame.timestamp) / 1000, 0),
        0.05,
      );
      const reference_blend = 1 - Math.exp(
        -frame.extraction_position_response * frame_delta_seconds,
      );
      for (let trail_index = 0;
        trail_index < first_extraction_frame.trail_ids.length;
        trail_index += 1) {
        const sword_id = first_extraction_frame.trail_ids[trail_index];
        const sword_entity = frame.entities.find((sword) => sword.id === sword_id);
        const reference_position = extraction_references.get(sword_id);
        const slot_angle = frame.wheel_rotation + sword_entity.slot_index * extraction_slot_step;
        const slot_x = frame.wheel_center_x + Math.cos(slot_angle) * frame.wheel_radius;
        const slot_y = frame.wheel_center_y + Math.sin(slot_angle) * frame.wheel_radius;
        reference_position.x += (slot_x - reference_position.x) * reference_blend;
        reference_position.y += (slot_y - reference_position.y) * reference_blend;
        const peel_distance = Math.hypot(
          sword_entity.x - reference_position.x,
          sword_entity.y - reference_position.y,
        );
        const extraction_delay = trail_index * frame.extraction_stagger_interval;

        // A follower must remain on its reference orbit until its own queue beat.
        if (frame.transition_elapsed < extraction_delay - frame_delta_seconds) {
          assert(
            peel_distance < frame.wheel_radius * 0.055,
            `sword ${sword_id} should not leave before its extraction beat`,
          );
        }
        if (!departed_sword_ids.has(sword_id) && peel_distance > frame.wheel_radius * 0.08) {
          departed_sword_ids.add(sword_id);
          departure_records.push({
            sword_id,
            frame_index,
            timestamp: frame.timestamp,
            transition_elapsed: frame.transition_elapsed,
          });
        }
      }
    }
    assert.equal(
      departure_records.length,
      expected_sword_trail_count,
      "all six swords should visibly leave their reference wheel paths",
    );
    assert.deepEqual(
      departure_records.map((record) => record.sword_id),
      before_breakout.formation_order.slice(0, expected_sword_trail_count),
      "the permanent first six identities should define extraction order",
    );
    for (let departure_index = 1; departure_index < departure_records.length; departure_index += 1) {
      assert(
        departure_records[departure_index].frame_index
          > departure_records[departure_index - 1].frame_index,
        `six swords should leave their slots strictly in queue order: ${JSON.stringify(departure_records)}`,
      );
      assert(
        departure_records[departure_index].timestamp
          - departure_records[departure_index - 1].timestamp >= 14,
        "successive swords should leave on distinct extraction beats",
      );
    }
    assert(
      departure_records.at(-1).timestamp - departure_records[0].timestamp > 100,
      "first-to-sixth extraction should remain visibly staggered",
    );
    for (let trail_index = 0; trail_index < departure_records.length; trail_index += 1) {
      const departure_record = departure_records[trail_index];
      const expected_delay = trail_index * first_extraction_frame.extraction_stagger_interval;
      assert(
        departure_record.transition_elapsed
          >= expected_delay - 1 / 60,
        `sword ${departure_record.sword_id} should respect its configured extraction delay`,
      );
    }
    for (const frame of extraction_frames.slice(first_extraction_index)) {
      assert.deepEqual(
        frame.trail_ids,
        first_extraction_frame.trail_ids,
        "six extracted sword identities should stay stable",
      );
      assert(
        frame.entities.filter((sword) => sword.opacity > 0.12).length
          >= expected_sword_trail_count,
        "wheel extraction must never leave fewer than six visible swords",
      );
    }
    for (let frame_index = first_extraction_index + 1; frame_index < extraction_frames.length; frame_index += 1) {
      const previous_frame = extraction_frames[frame_index - 1];
      const current_frame = extraction_frames[frame_index];
      for (const sword_id of first_extraction_frame.trail_ids) {
        const previous_sword = previous_frame.entities.find((sword) => sword.id === sword_id);
        const current_sword = current_frame.entities.find((sword) => sword.id === sword_id);
        const extraction_step = Math.hypot(
          current_sword.x - previous_sword.x,
          current_sword.y - previous_sword.y,
        );
        const frame_delta_ms = current_frame.timestamp - previous_frame.timestamp;
        const frame_delta_seconds = Math.min(Math.max(frame_delta_ms / 1000, 0), 0.05);
        const allowed_step_ratio = Math.min(1.5, 0.18 + 32 * frame_delta_seconds);
        assert(
          extraction_step < current_frame.wheel_radius * allowed_step_ratio,
          `extracted sword ${sword_id} step ${extraction_step.toFixed(2)} over ${(
            frame_delta_ms
          ).toFixed(1)}ms at radius ${current_frame.wheel_radius.toFixed(2)} should remain continuous`,
        );
      }
    }
    const extracted_leader = first_extraction_frame.entities.find((sword) => (
      sword.id === expected_leader.id
    ));
    assert(
      Math.hypot(
        extracted_leader.x - first_extraction_frame.pointer_x,
        extracted_leader.y - first_extraction_frame.pointer_y,
      ) > before_breakout.wheel_radius * 0.35,
      "extracted leader should not be reseeded at the cursor center",
    );

    // Continue moving while extraction completes, then capture the resulting six-sword wake.
    const trail_target = { x: 650, y: 650 };
    await _move_pointer_path(page, extraction_follow_target, trail_target, 300, 15);
    const resumed_state = await _read_sword_state(page);
    assert.equal(resumed_state.mode, "trailing", "completed extraction should become trail mode");
    assert.deepEqual(
      resumed_state.trail_ids,
      before_breakout.formation_order.slice(0, expected_sword_trail_count),
      "trail should restore the same ordered first six identities",
    );
    const resumed_trail_entities = resumed_state.trail_ids.map((sword_id) => (
      resumed_state.entities.find((sword_entity) => sword_entity.id === sword_id)
    ));
    assert(
      resumed_trail_entities.every((sword_entity) => sword_entity.opacity > 0.12),
      "all six ordered trail swords should remain visible after extraction",
    );
    for (let trail_index = 0; trail_index < resumed_trail_entities.length; trail_index += 1) {
      const sword_entity = resumed_trail_entities[trail_index];
      const target_sample = resumed_state.trail_targets[trail_index];
      assert(
        Math.hypot(sword_entity.x - target_sample.x, sword_entity.y - target_sample.y) < 0.5,
        "completed extraction should settle every guard onto the recorded path",
      );
    }
    for (let trail_index = 1; trail_index < resumed_trail_entities.length; trail_index += 1) {
      const preceding_sword = resumed_trail_entities[trail_index - 1];
      const following_sword = resumed_trail_entities[trail_index];
      const preceding_handle_extent = (
        resumed_state.base_height * preceding_sword.height_scale
          * expected_sword_guard_anchor_ratio
      );
      const following_blade_extent = (
        resumed_state.base_height * following_sword.height_scale
          * (1 - expected_sword_guard_anchor_ratio)
      );
      const sprite_clearance = (
        resumed_state.pair_spacings[trail_index - 1]
        - preceding_handle_extent
        - following_blade_extent
      );
      assert(
        sprite_clearance >= resumed_state.base_height * 0.075,
        "the extracted swords should settle into a visibly separated curved queue",
      );
    }
    // Reorient the wake across open sky so visual evidence contains all six swords.
    const visual_trail_start = { x: 100, y: 700 };
    const visual_trail_target = { x: 650, y: 700 };
    await _move_pointer_path(page, trail_target, visual_trail_start, 360, 20);
    await _move_pointer_path(page, visual_trail_start, visual_trail_target, 520, 30);
    const visual_trail_state = await _read_sword_state(page);
    const visual_trail_entities = visual_trail_state.trail_ids.map((sword_id) => (
      visual_trail_state.entities.find((sword_entity) => sword_entity.id === sword_id)
    ));
    assert.equal(visual_trail_state.mode, "trailing", "visual trail evidence should remain in motion");
    assert.equal(
      visual_trail_entities.filter((sword_entity) => sword_entity.opacity > 0.12).length,
      expected_sword_trail_count,
      "visual trail evidence should retain all six swords",
    );
    const trail_minimum_x = Math.min(...visual_trail_entities.map((sword_entity) => sword_entity.x));
    const trail_minimum_y = Math.min(...visual_trail_entities.map((sword_entity) => sword_entity.y));
    const trail_clip_width = 760;
    const trail_clip_height = 500;
    await page.screenshot({
      path: path.join(artifact_root, "sword-trail.png"),
      clip: {
        x: Math.max(
          0,
          Math.min(visual_trail_state.field_width - trail_clip_width, trail_minimum_x - 120),
        ),
        y: Math.max(
          0,
          Math.min(visual_trail_state.field_height - trail_clip_height, trail_minimum_y - 150),
        ),
        width: trail_clip_width,
        height: trail_clip_height,
      },
    });

    // Scroll down and confirm fixed-canvas coordinates still follow viewport input.
    await page.locator("#research").scrollIntoViewIfNeeded();
    await page.mouse.move(600, 350);
    await page.waitForTimeout(40);
    const scrolled_state = await _read_sword_state(page);
    assert(await page.evaluate(() => window.scrollY > 0), "test should reach a lower section");
    assert(
      Math.abs(scrolled_state.target_x * scrolled_state.field_width - 600) < 2,
      "sword x coordinate should remain viewport-local after scrolling",
    );
    assert(
      Math.abs(scrolled_state.target_y * scrolled_state.field_height - 350) < 2,
      "sword y coordinate should remain viewport-local after scrolling",
    );

    // Verify the accessibility fallback suppresses every sword transition.
    const reduced_page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await reduced_page.emulateMedia({ reducedMotion: "reduce" });
    await reduced_page.goto(prototype_url, { waitUntil: "load" });
    await reduced_page.mouse.move(500, 360, { steps: 8 });
    await reduced_page.waitForTimeout(400);
    const reduced_state = await _read_sword_state(reduced_page);
    assert.equal(reduced_state.mode, "dormant", "reduced motion should keep swords dormant");
    assert.equal(
      reduced_state.entities.filter((sword) => sword.opacity > 0.003).length,
      0,
      "reduced motion should hide every sword entity",
    );
    await reduced_page.close();
  } finally {
    // Release Chrome even when an assertion fails, then surface captured page errors.
    await browser.close();
  }

  // Treat browser console and uncaught JavaScript errors as implementation failures.
  assert.deepEqual(browser_errors, [], `browser errors: ${browser_errors.join("; ")}`);
  return 0;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

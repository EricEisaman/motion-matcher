# Motion Matcher — Physical Science Edition

**Learn kinematics by *being* the motion.**

Motion Matcher turns your webcam into a real-time physics lab. Using Face Tracking or General Image Tracking, you move your body (or any object) to try to match a target kinematic graph. It’s kinesthetic, immediate, and built for Physical Science, Physics, and Introductory Mechanics.

---

## Table of Contents
1. [Quick Start](#quick-start)
2. [Two Ways to Track](#two-ways-to-track)
3. [Core Physical Science Concepts You Learn](#core-physical-science-concepts-you-learn)
4. [The Kinematic Graphs — What Every Part Means](#the-kinematic-graphs--what-every-part-means)
   - [Position vs. Time (x-t and y-t)](#1-position-vs-time-graph)
   - [Velocity vs. Time (v-t)](#2-velocity-vs-time-graph)
   - [Acceleration vs. Time (a-t)](#3-acceleration-vs-time-graph)
5. [Face Tracking: Your Body as the Data](#face-tracking-your-body-as-the-data)
6. [General Image Tracking: Track Anything](#general-image-tracking-track-anything)
7. [Motion Matching: The Game Loop](#motion-matching-the-game-loop)
8. [Key Experimental Skills](#key-experimental-skills)
9. [Classroom Activities](#classroom-activities)
10. [Technical Details for Teachers](#technical-details-for-teachers)
11. [Tips & Troubleshooting](#tips--troubleshooting)

---

## Quick Start

```bash
# clone the repo
git clone https://github.com/EricEisaman/motion-matcher.git
cd motion-matcher

# install (bun or npm)
bun install
# or
npm install

# run
bun run dev
# or
npm run dev
```

Open `http://localhost:5173`, allow camera access, and choose your tracker:

- **Face Tracker**: No markers needed. Just you.
- **General Image Tracker**: Click / drag to select any high-contrast object in the camera view — a tennis ball, a toy car, a sticky note on a cart, a projectile.

---

## Two Ways to Track

### 1. Face Tracking (Embodied Learning)
Uses MediaPipe Face Mesh in the browser. Your nose/face centroid becomes the tracked point. The x (horizontal) and y (vertical) pixel position of your face is sampled every frame (~30-60 fps).

**Best for:** Understanding graphs *kinesthetically*. Students literally walk, lean, crouch, and speed up.

### 2. General Image Tracker (Object Lab)
In this branch, you can select *any* image patch. The tracker uses template matching / optical flow to follow that patch frame-to-frame.

**Best for:** Traditional labs without sensors — cart on ramp, pendulum bob, bouncing ball, person on a skateboard, etc. You can stick a printed ArUco-style marker or any high-contrast image on the object.

Both modes output the same data stream: `t, x(t), y(t)` which is then differentiated to get velocity and acceleration.

---

## Core Physical Science Concepts You Learn

This app is not a simulation — it's a measurement tool. Students discover:

### 1. Kinematics Fundamentals
- **Reference Frame & Origin:** The top-left of the video is (0,0) in pixels, but the app re-centers origin to the middle or starting position. Students learn that position only makes sense *relative to a chosen origin*.
- **Position (x, y):** Location at an instant.
- **Displacement (Δx = x_f - x_i):** Change in position. Vector.
- **Distance:** Total path length traveled (scalar). Why you can have zero displacement but non-zero distance if you go back and forth.
- **Time (t):** Independent variable. Sampled at fixed Δt = 1 / frameRate.
- **Scalar vs. Vector:** Speed vs. Velocity, Distance vs. Displacement. Your x-direction matters.

### 2. Rates of Change
- **Average Velocity:** `v_avg = Δx / Δt` — slope between two points.
- **Instantaneous Velocity:** `v = dx/dt` — slope of the tangent line at one moment. The app calculates this by differentiating your position trace.
- **Average vs. Instantaneous Speed:** Why a car’s speedometer vs. trip average differ.
- **Acceleration:** `a = dv/dt = d²x/dt²` — rate of change of velocity.

### 3. Graphical Literacy (NGSS Practice 4)
- **Slope = Rate:** Slope of x-t is velocity. Slope of v-t is acceleration.
- **Area = Accumulation:** Area under v-t is displacement. Area under a-t is change in velocity.
- **Curvature:** Curved x-t means accelerating. Straight x-t means constant velocity.
- **Intercepts & Zero Crossings:** What it means when position is zero (at origin), velocity is zero (turning around), acceleration is zero (constant velocity).

### 4. Motion Types
- **At Rest:** Horizontal line on x-t, zero on v-t and a-t.
- **Constant Velocity:** Straight diagonal line on x-t, horizontal non-zero line on v-t, zero on a-t.
- **Constant Acceleration:** Parabola on x-t, diagonal line on v-t, horizontal non-zero line on a-t.
- **Non-Uniform Acceleration:** Curved lines on all graphs. Human motion is naturally like this — great for discussion of jerk.

### 5. Measurement & Uncertainty
- **Noise & Jitter:** Raw pixel tracking is noisy. Students see why raw v-t and a-t look spiky.
- **Filtering & Smoothing:** The app applies smoothing. Trade-off: too much smoothing hides real quick stops.
- **Calibration & Units:** Pixels → meters. Students can place a meter stick in view to calibrate scale. Without calibration, we use arbitrary units but ratios and shapes are still correct physics.
- **Frame Rate as Δt:** Faster frame rate = smaller Δt = better estimate of instantaneous values.

---

## The Kinematic Graphs — What Every Part Means

The app shows three stacked graphs sharing the same time axis. When you use **Face Tracking**, YOU are the object.

### 1. Position vs. Time Graph

**Axes:** Vertical = position (x or y), Horizontal = time (seconds)

This is the most intuitive graph.

- **Value (height on graph):** Where you are at that instant. If the graph shows +100, you are 100 px (or ~1m if calibrated) to the right / above the origin.
- **Slope (steepness):** Your velocity.
  - **Steep positive slope:** Moving quickly to the right (or up)
  - **Shallow positive slope:** Moving slowly to the right
  - **Zero slope (flat):** Stopped. Standing still.
  - **Negative slope:** Moving left (or down)
  - **Steeper negative:** Moving fast left/down
- **Curvature:**
  - **Straight line:** Constant velocity — you’re walking at steady pace
  - **Curving upward (concave up):** Speeding up to the right — you are accelerating positively
  - **Curving downward (concave down):** Slowing down to the right or speeding up to the left — acceleration negative
- **Y vs X:** In face tracking, horizontal motion → x-t graph. Crouching / jumping → y-t graph. Students can do 2D motion and see both.

**Face Tracking Connection:**
- Stand in center → position = 0
- Take a step right → position goes up. Your body literally creates the line.
- Walk right at constant speed → you draw a straight diagonal line. To do it, you must keep your pace perfectly even — surprisingly hard!
- Walk right, then stop, then walk right again → stair-step pattern. Flat part = you stopped.

### 2. Velocity vs. Time Graph

**Axes:** Vertical = velocity (m/s or px/s), Horizontal = time

This is the *derivative* of position. Students often find it less intuitive until they embody it.

- **Value (height):** How fast and which direction you are moving *right now*.
  - **Above zero:** Moving right / up
  - **Below zero:** Moving left / down
  - **Zero line:** Momentarily at rest — the turnaround point
- **Slope:** Your acceleration.
  - **Flat horizontal line:** Constant velocity — no acceleration. You’re cruising.
  - **Positive slope:** Speeding up to the right, or slowing down moving left. Acceleration is positive.
  - **Negative slope:** Slowing down to the right, or speeding up to the left. Acceleration is negative.
- **Area Under Curve:** The total displacement.
  - Area above zero = displacement to the right/up
  - Area below zero = displacement to the left/down
  - Net area = where you end up relative to start. If you go right and return, area cancels to zero — you’re back at start even though you moved!

**Face Tracking Connection:**
- To match a flat v-t graph at +0.5 m/s, you must walk right at a *perfectly* steady speed. If you wobble, the graph wobbles — students feel velocity instability.
- To create a diagonal line on v-t (constant acceleration), you must gradually speed up. Walk faster and faster. Your legs feel the acceleration.
- To cross from positive to negative velocity, you must stop and reverse direction. That zero-crossing moment is when you plant your feet and turn — you *feel* v=0.

### 3. Acceleration vs. Time Graph

**Axes:** Vertical = acceleration (m/s² or px/s²), Horizontal = time

Derivative of velocity. Noisiest, most sensitive — teaches about measurement.

- **Value:**
  - **Zero:** Constant velocity (or at rest). No net force (Newton’s 1st).
  - **Positive constant:** Velocity increasing in positive direction. If using x-tracking, you’re speeding up right.
  - **Negative constant:** Velocity decreasing (or speeding up negative direction)
  - **Spikes:** Quick starts, stops, jerks. Human motion has lots of spikes — we’re not ideal physics carts.
- **Area Under Curve:** Change in velocity (Δv). If acceleration area is positive, you end up going faster right than you started.
- **Slope (Jerk):** How quickly acceleration changes. In physical science we usually ignore jerk, but students see it when they try to start abruptly.

**Face Tracking Connection:**
- Standing still then *suddenly* lunging right → big positive spike on a-t. That spike is the force your muscles applied.
- Trying to match a-t = 0 is the ultimate control challenge: you must move with absolutely no speeding up or slowing down. Students realize constant velocity requires constant effort and focus.
- Walking vs. running: Running shows larger and more variable acceleration because your head bobs.

> **Key Insight for Students:** Your muscles feel acceleration, not velocity. When you’re cruising on a smooth train at constant velocity, you feel nothing. When the train brakes (negative acceleration), you feel it. The a-t graph is what your body feels.

---

## Face Tracking: Your Body as the Data

Why face tracking for physical science?

1. **Embodied Cognition:** You can’t fake understanding. If you don’t know that a flat x-t means stopped, your body will move and the graph will show it.
2. **Immediate Feedback Loop:** See graph → adjust movement → see graph change in <100ms.
3. **No Equipment:** Laptop + webcam = lab.
4. **Safety & Inclusion:** No cart launchers, no falling masses. Any student can participate seated (leaning side to side) or standing.

**Movement Map (default camera is mirrored):**

| Your Action | x-t Graph | v-t Graph | a-t Graph |
|---|---|---|---|
| Stand still center | Flat at 0 | Flat at 0 | Flat at 0 |
| Lean / step right and hold | Rises then flat high | Positive spike then 0 | + then - spike |
| Walk right at constant speed | Straight line up | Flat positive | Flat at 0 |
| Walk left at constant speed | Straight line down | Flat negative | Flat at 0 |
| Walk right, speed up gradually | Curve upward | Line sloping up | Flat positive |
| Walk right, slow to stop | Curve flattening | Line sloping down to 0 | Flat negative |
| Crouch down / jump (y-track) | y position down/up | Negative/positive v_y | Negative/positive a_y |

**Calibration Tip:** Have a student hold a meter stick horizontally at face height. Click measure to set px/m conversion. Now x-t is in meters, v-t in m/s.

---

## General Image Tracking: Track Anything

Select a region to track:

1.  Click **General Image Tracker** mode
2.  Drag a box around your object (use a high-contrast, non-reflective object)
3.  Press Start

**Classroom uses:**

- **Cart on Ramp:** Put a colored sticker on a dynamics cart. Record x-t down ramp → see constant acceleration (parabolic x-t, linear v-t)
- **Pendulum:** Track bob from side → sinusoidal x-t and v-t, 90° out of phase
- **Bouncing Ball:** Track vertical y-t → parabolic arcs between bounces, velocity flips sign at bounce, acceleration ~ -9.8 m/s² between bounces (if calibrated)
- **Projectile:** Toss a ball with marker across view → x-t is constant velocity (flat v_x), y-t is constant acceleration
- **Student-Created Motion:** Students can design their own motion challenges for peers to match

**Image Tracking vs Face Tracking:**
Face tracking is robust because faces have many features. General image tracker can lose lock if background is cluttered, object rotates, or lighting changes. This is itself a lesson: *experimental design matters — control your variables (lighting, contrast, background).*

---

## Motion Matching: The Game Loop

1.  **Target Graph Appears:** A pre-drawn x-t (or v-t) graph shows — e.g., “stay at rest 2s, move right at constant velocity 3s, stop”
2.  **Countdown:** 3-2-1
3.  **You Move:** Your live trace (color) draws over target (gray)
4.  **Score:** RMS error or % time within tolerance. Students iterate to improve.

**Why matching works for learning:**
- To match a shape, you must *predict* what motion makes it. This is inverse kinematics thinking.
- It makes abstract graphs concrete: “Oh, to make v-t go negative, I have to walk backwards”
- Peer competition drives iteration and discussion: “How did you get that flat velocity? Shuffle your feet slower!”

Suggested progression:
1.  Match **Position vs Time** only (most intuitive)
2.  Match **Velocity vs Time** — hide position graph
3.  Match **Acceleration vs Time** — advanced, requires smoothing
4.  **Create** your own target and challenge a classmate

---

## Key Experimental Skills

- **Coordinate System Choice:** Where is 0? Does + mean right or left? Students can flip sign.
- **Time Zero:** When does recording start? Importance of synchronization.
- **Data Smoothing:** Raw derivative amplifies noise. Students compare raw vs smoothed v-t and discuss signal vs noise.
- **Scale & Proportional Reasoning:** Pixels aren’t meters, but slope ratios are preserved. If calibrated, students calculate real speed in m/s and compare to walking speed (~1.4 m/s).
- **Error Analysis:** Why didn’t my trace match? Reaction time, overshoot, drift.
- **Vector Components:** x and y are independent. Students can do diagonal motion and see components.

---

## Classroom Activities

### Activity 1: Can You Stand Still? (5 min)
Goal: Flat line on all graphs.
Concepts: At rest, zero velocity, zero acceleration, noise.

### Activity 2: The Constant Velocity Walk (10 min)
Goal: Make a straight line on x-t.
Question: What does constant velocity *feel* like? Why is it hard?
Extension: Calculate your v_avg from slope. Measure distance walked / time with stopwatch and compare to graph slope.

### Activity 3: Speed Up, Slow Down (15 min)
Goal: Create a parabola on x-t.
Concepts: Acceleration = change in velocity, curvature = acceleration. Positive vs negative acceleration.

### Activity 4: There and Back (10 min)
Goal: Go right then return to start.
Concepts: Displacement = 0 but distance > 0. Area under v-t cancels. Velocity changes sign.

### Activity 5: General Image — Ramp Lab (20 min)
Stick marker on cart, release down ramp. Capture x-t, v-t, a-t.
Concepts: Constant acceleration due to component of gravity, a = g sin(theta). Compare a measured vs predicted.

### Activity 6: Design a Challenge (15 min)
Students draw a target graph that includes at least one period of rest, constant velocity, and acceleration. Peers must perform it and narrate their motion.

---

## Technical Details for Teachers

- **Stack:** Vite + React + TypeScript + MediaPipe Face Landmarker + custom template tracker (via Canvas)
- **Privacy:** All processing is client-side. No video leaves the browser. Works offline after load. No data stored unless you export CSV.
- **Browser:** Chrome / Edge recommended. Needs WebGL for MediaPipe.
- **Lighting:** Face tracking needs front light on face. Image tracking needs diffuse light, no glare.
- **Performance:** 720p is sufficient. Higher resolution = more pixels but more CPU. 30fps default.
- **Data Export:** CSV export includes `time_s, x_px, y_px, x_m, y_m, vx, vy, ax, ay` if calibrated.
- **Units:** If not calibrated, units are px and px/s. Teach proportional reasoning first, then calibrate for quantitative labs.

**Repo structure (`general-image-tracker` branch):**
```
src/
  components/
    TrackerSelector.tsx    # Choose face vs image tracker
    GraphPanel.tsx         # x-t, v-t, a-t graphs (using Chart.js / custom canvas)
    VideoCanvas.tsx        # Webcam + overlay
  lib/
    faceTracker.ts         # MediaPipe face mesh wrapper
    imageTracker.ts        # Template matching / KLT tracker
    kinematics.ts          # Differentiation, smoothing, calibration
    scoring.ts             # Match scoring
```

---

## Tips & Troubleshooting

- **Graph is jittery:** Lower lighting or fast head bob. Enable stronger smoothing, reduce motion speed, stand farther from camera.
- **Face jumps to background:** Another face in view, or poster with face. Clear background.
- **Image tracker loses object:** Object too small (<30px), too similar to background, rotates >20°, motion blur. Use larger, high-contrast marker and slower motion.
- **Velocity not zero when I’m still:** Micro-movements of head, breathing. Normal — teaches limits of measurement.
- **Mirrored motion feels backwards:** Toggle Mirror in settings. Standard webcam mirror helps embodiment.
- **Students with mobility limitations:** Use seated lean, hand movement close to camera with image tracker, or track a toy car they push.

---

## Standards Alignment

- **NGSS:** PS2.A Forces and Motion, PS2-1, PS2-2; Science & Engineering Practices: Planning Investigations, Analyzing Data, Using Mathematics
- **Common Core Math:** 8.F.B.4 — slope as rate of change; HSF-IF.B.6 — average rate of change
- **AP Physics 1:** Kinematics — graphical analysis is ~20% of exam

---

## License & Credits

MIT License. Built by Eric Eisaman and contributors. Face tracking via Google MediaPipe. General image tracker implementation built for classroom use in this branch.

**Want to contribute a new target graph or lab?** Open a PR against `general-image-tracker` with a JSON file in `/public/targets/`.

> Made for teachers who want students to *feel* physics before they calculate it.

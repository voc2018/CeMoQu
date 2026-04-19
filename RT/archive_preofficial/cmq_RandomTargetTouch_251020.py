import cv2
import mediapipe as mp
import random
import time
import math
import csv

# --- Initialization ---
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
cap = cv2.VideoCapture(0)

# --- Parameters ---
TARGET_RADIUS = 35
NUM_TARGETS = 5
TIME_LIMIT = 4.0
TEST_TYPES = ["Finger Chase", "Finger to Nose"]  # Removed Finger-to-Finger
current_test = 0

# --- Finger Chase Parameters (Adjustable) ---
CHASE_SPEED = 5.0
CHASE_AMPLITUDE_X = 30
CHASE_AMPLITUDE_Y = 30

# --- CSV Logging ---
csv_file = open("ataxia_test_results.csv", mode="w", newline="")
csv_writer = csv.writer(csv_file)
csv_writer.writerow([
    "Test Type", "Target Index", "Hit Time (s)", "Distance (px)",
    "Smoothness", "Tremor Amplitude", "Score (0-4)"
])

# --- Helper Functions ---
def get_random_target():
    return random.randint(120, 520), random.randint(100, 380)

def compute_smoothness(positions):
    if len(positions) < 5:
        return 0
    velocities = [math.hypot(positions[i+1][0]-positions[i][0],
                             positions[i+1][1]-positions[i][1])
                  for i in range(len(positions)-1)]
    if len(velocities) < 2:
        return 0
    diffs = [abs(velocities[i+1]-velocities[i]) for i in range(len(velocities)-1)]
    return round(sum(diffs)/len(diffs), 2)

def compute_tremor(positions):
    if len(positions) < 10:
        return 0
    xs = [p[0] for p in positions]
    ys = [p[1] for p in positions]
    mean_x, mean_y = sum(xs)/len(xs), sum(ys)/len(ys)
    tremor = math.sqrt(sum((x-mean_x)**2 + (y-mean_y)**2 for x,y in positions)/len(positions))
    return round(tremor, 2)

def sara_score_from_distance(dist):
    if dist < 20: return 0
    elif dist < 40: return 1
    elif dist < 60: return 2
    elif dist < 80: return 3
    else: return 4

# --- Target Setup ---
targets = [get_random_target() for _ in range(NUM_TARGETS)]
target_index = 0
hit_times, distances, scores = [], [], []
path_positions = []
start_time = time.time()

# --- Main Loop ---
with mp_hands.Hands(
    model_complexity=0,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
) as hands:

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            continue

        frame = cv2.flip(frame, 1)
        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(image_rgb)
        h, w, _ = frame.shape

        # Display Test Info
        cv2.putText(frame, f"Test: {TEST_TYPES[current_test]}  Target: {target_index+1}/{NUM_TARGETS}",
                    (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

        # Dynamic target motion (Finger Chase only)
        if TEST_TYPES[current_test] == "Finger Chase":
            base_tx, base_ty = targets[target_index]
            tx = base_tx + int(CHASE_AMPLITUDE_X * math.sin(time.time() * CHASE_SPEED))
            ty = base_ty + int(CHASE_AMPLITUDE_Y * math.cos(time.time() * CHASE_SPEED))
        else:
            tx, ty = targets[target_index]

        # Draw target
        cv2.circle(frame, (tx, ty), TARGET_RADIUS, (0, 255, 0), 3)

        if results.multi_hand_landmarks:
            hand_landmarks = results.multi_hand_landmarks[0]
            mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
            index_tip = hand_landmarks.landmark[mp_hands.HandLandmark.INDEX_FINGER_TIP]
            cx, cy = int(index_tip.x * w), int(index_tip.y * h)
            cv2.circle(frame, (cx, cy), 10, (255, 0, 0), -1)

            # Record path
            path_positions.append((cx, cy))
            dist = math.hypot(cx - tx, cy - ty)
            elapsed = time.time() - start_time

            # Success condition
            if dist <= TARGET_RADIUS:
                smoothness = compute_smoothness(path_positions)
                tremor = compute_tremor(path_positions)
                score = sara_score_from_distance(dist)

                print(f"🎯 {TEST_TYPES[current_test]} → Target {target_index+1} hit in {elapsed:.2f}s | Dist={dist:.1f} | Smooth={smoothness} | Tremor={tremor}")

                csv_writer.writerow([TEST_TYPES[current_test], target_index+1, f"{elapsed:.2f}",
                                     f"{dist:.1f}", smoothness, tremor, score])
                hit_times.append(elapsed)
                distances.append(dist)
                scores.append(score)

                path_positions.clear()
                target_index += 1
                start_time = time.time()

            # Timeout condition
            elif elapsed > TIME_LIMIT:
                print(f"⏱️ {TEST_TYPES[current_test]} → Target {target_index+1} FAILED (timeout)")
                csv_writer.writerow([TEST_TYPES[current_test], target_index+1, "Timeout", "-", "-", "-", 4])
                hit_times.append(None)
                distances.append(None)
                scores.append(4)
                path_positions.clear()
                target_index += 1
                start_time = time.time()

        # Switch to next test when done
        if target_index >= NUM_TARGETS:
            avg_score = sum(scores) / len(scores)
            avg_time = sum(t for t in hit_times if t) / len([t for t in hit_times if t])
            cv2.putText(frame, f"Test Done! Avg Time: {avg_time:.2f}s | Avg Score: {avg_score:.2f}",
                        (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            cv2.imshow("Ataxia Test", frame)
            cv2.waitKey(1500)

            current_test += 1
            if current_test >= len(TEST_TYPES):
                break

            # Reset for next test
            targets = [get_random_target() for _ in range(NUM_TARGETS)]
            target_index = 0
            hit_times, distances, scores = [], [], []
            start_time = time.time()
            continue

        cv2.imshow("Ataxia Test", frame)
        key = cv2.waitKey(5) & 0xFF
        if key in [27, ord('q')]:
            break

cap.release()
csv_file.close()
cv2.destroyAllWindows()
print("✅ Test Complete. Results saved to 'ataxia_test_results.csv'")


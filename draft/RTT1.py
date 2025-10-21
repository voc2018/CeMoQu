import cv2
import mediapipe as mp
import random
import time
import math
import csv

mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
cap = cv2.VideoCapture(0)

# 랜덤 타겟 생성 함수
def get_random_target():
    return random.randint(100, 500), random.randint(100, 400)

# 설정
target_radius = 40
num_targets = 10   # 🎯 더 많은 타겟
targets = [get_random_target() for _ in range(num_targets)]
target_index = 0
hit_times = []
distances = []
sara_scores = []
last_score = None  # 최근 점수 표시용

# 시작 시간
start_time = time.time()

# CSV 파일 초기화
csv_file = open("finger_chase_results.csv", mode="w", newline="")
csv_writer = csv.writer(csv_file)
csv_writer.writerow(["Target", "Hit Time (s)", "Distance (px)", "Score (0-4)"])

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

        # 타겟 표시
        if target_index < len(targets):
            tx, ty = targets[target_index]
            cv2.circle(frame, (tx, ty), target_radius, (0, 255, 0), 3)
            cv2.putText(frame, f"Target {target_index+1}/{num_targets}",
                        (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                        (0, 255, 0), 2)

        # 손 추적
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                index_tip = hand_landmarks.landmark[mp_hands.HandLandmark.INDEX_FINGER_TIP]
                cx, cy = int(index_tip.x * w), int(index_tip.y * h)
                cv2.circle(frame, (cx, cy), 10, (255, 0, 0), -1)

                if target_index < len(targets):
                    dist = math.hypot(cx - tx, cy - ty)
                    elapsed = time.time() - start_time

                    # 성공 조건
                    if dist <= target_radius:
                        # SARA 점수 계산
                        if dist < 20:
                            score = 0
                        elif dist < 40:
                            score = 1
                        elif dist < 60:
                            score = 2
                        elif dist < 80:
                            score = 3
                        else:
                            score = 4

                        last_score = score  # 최근 점수 저장
                        print(f"🎯 Target {target_index+1} hit in {elapsed:.2f}s at distance {dist:.1f}px → Score: {score}")

                        hit_times.append(elapsed)
                        distances.append(dist)
                        sara_scores.append(score)
                        csv_writer.writerow([target_index+1, f"{elapsed:.2f}", f"{dist:.1f}", score])

                        target_index += 1
                        start_time = time.time()

                    # 시간 초과 (3초 이상)
                    elif elapsed > 3.0:
                        print(f"⏱️ Target {target_index+1} FAILED (timeout)")
                        last_score = 4
                        hit_times.append(None)
                        distances.append(None)
                        sara_scores.append(4)  # 실패는 최대 점수
                        csv_writer.writerow([target_index+1, "Timeout", "-", 4])
                        target_index += 1
                        start_time = time.time()

        # 최근 점수 표시
        if last_score is not None:
            cv2.putText(frame, f"Last Score: {last_score}",
                        (20, h - 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                        (0, 0, 255), 2)

        # 최종 결과 표시
        if target_index >= len(targets):
            avg_time = sum(t for t in hit_times if t is not None) / len([t for t in hit_times if t is not None])
            avg_score = sum(sara_scores) / len(sara_scores)
            cv2.putText(frame, f"Done! Avg Time: {avg_time:.2f}s  Avg Score: {avg_score:.2f}",
                        (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                        (255, 0, 0), 2)

        cv2.imshow("Finger Chase v3", frame)
        key = cv2.waitKey(5) & 0xFF
        if key == 27 or key == ord('q'):
            break

cap.release()
csv_file.close()
cv2.destroyAllWindows()

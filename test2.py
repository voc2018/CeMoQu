import cv2
import mediapipe as mp
import random
import time
import math

# 초기 설정
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
cap = cv2.VideoCapture(0)

# 랜덤 타겟 위치 생성 함수
def get_random_target():
    return random.randint(100, 500), random.randint(100, 400)

target_radius = 40
targets = [get_random_target() for _ in range(5)]
target_index = 0
hit_times = []

# 첫 타겟 시작 시간
start_time = time.time()

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

        # 손 추적
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

                # 검지 끝 좌표
                index_tip = hand_landmarks.landmark[mp_hands.HandLandmark.INDEX_FINGER_TIP]
                cx, cy = int(index_tip.x * w), int(index_tip.y * h)
                cv2.circle(frame, (cx, cy), 10, (255, 0, 0), -1)

                # 타겟과의 거리 계산
                if target_index < len(targets):
                    dist = math.hypot(cx - tx, cy - ty)
                    if dist <= target_radius:
                        elapsed = time.time() - start_time
                        hit_times.append(elapsed)
                        print(f"🎯 Target {target_index + 1} hit in {elapsed:.2f} seconds")
                        target_index += 1
                        start_time = time.time()

        # 모든 타겟 완료 시 결과 표시
        if target_index >= len(targets):
            avg_time = sum(hit_times) / len(hit_times)
            cv2.putText(frame, f"Done! Avg time: {avg_time:.2f}s", (50, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

        cv2.imshow("Finger Chase", frame)
        key = cv2.waitKey(5) & 0xFF
        if key == 27 or key == ord('q'):  # ESC 또는 'q' 키로 종료
            break

cap.release()
cv2.destroyAllWindows()
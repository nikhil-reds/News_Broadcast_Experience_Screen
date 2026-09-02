import serial
import time

# Change COM3 to your ESP32 port, e.g. COM4, COM5 on Windows
PORT = "COM3"
BAUD_RATE = 115200

ser = serial.Serial(PORT, BAUD_RATE, timeout=1)
time.sleep(2)  # wait for ESP32 reset

print("Reading data from ESP32... Press Ctrl+C to stop.")

try:
    while True:
        if ser.in_waiting > 0:
            data = ser.readline().decode("utf-8", errors="ignore").strip()
            print(data)

except KeyboardInterrupt:
    print("Stopped.")

finally:
    ser.close()
import {
  GestureRecognizer,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

export class HandDetector {
  constructor() {
    this.gestureRecognizer = null;
    this.video = null;
    this.isInitialized = false;
    this.lastVideoTime = -1;
    this.lastResults = null;
    this.webcamRunning = false;
    
    // Pinch detection threshold (distance between thumb tip and index tip)
    this.pinchThreshold = 0.05;
  }

  async initialize() {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      
      this.gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });
      
      this.isInitialized = true;
      console.log("HandDetector initialized successfully");
      return true;
    } catch (error) {
      console.error("Failed to initialize HandDetector:", error);
      return false;
    }
  }

  async startWebcam() {
    if (!this.isInitialized) {
      console.warn("HandDetector not initialized. Call initialize() first.");
      return false;
    }

    if (this.webcamRunning) {
      return true;
    }

    try {
      // Create video element if it doesn't exist
      if (!this.video) {
        this.video = document.createElement('video');
        this.video.style.display = 'none'; // Hidden video element
        this.video.autoplay = true;
        this.video.playsInline = true;
        document.body.appendChild(this.video);
      }

      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = stream;
      this.webcamRunning = true;

      return new Promise((resolve) => {
        this.video.addEventListener("loadeddata", () => {
          this.video.play();
          resolve(true);
        });
      });
    } catch (error) {
      console.error("Error starting webcam:", error);
      return false;
    }
  }

  // Calculate distance between two 3D points
  calculateDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    const dz = point1.z - point2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Detect pinch gesture between thumb tip and index tip
  detectPinch(landmarks) {
    // MediaPipe hand landmark indices
    const THUMB_TIP = 4;
    const INDEX_TIP = 8;
    
    if (landmarks.length < 21) return null;
    
    const thumbTip = landmarks[THUMB_TIP];
    const indexTip = landmarks[INDEX_TIP];
    
    const distance = this.calculateDistance(thumbTip, indexTip);
    const isPinching = distance < this.pinchThreshold;
    
    if (isPinching) {
      // Return the midpoint between thumb and index as cursor position
      return {
        isPinching: true,
        position: {
          x: (thumbTip.x + indexTip.x) / 2,
          y: (thumbTip.y + indexTip.y) / 2,
          z: (thumbTip.z + indexTip.z) / 2
        },
        distance: distance
      };
    }
    
    return {
      isPinching: false,
      position: null,
      distance: distance
    };
  }

  // Main detection function that can be polled
  getDetections() {
    if (!this.isInitialized || !this.gestureRecognizer || !this.video || !this.webcamRunning) {
      return {
        leftHand: {
          gesture: null,
          pinch: { isPinching: false, position: null }
        },
        rightHand: {
          gesture: null,
          pinch: { isPinching: false, position: null }
        }
      };
    }

    // Only process if video time has changed
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      try {
        this.lastResults = this.gestureRecognizer.recognizeForVideo(this.video, Date.now());
      } catch (error) {
        console.error("Error during gesture recognition:", error);
        return this.getEmptyDetections();
      }
    }

    if (!this.lastResults) {
      return this.getEmptyDetections();
    }

    const detections = {
      leftHand: {
        gesture: null,
        pinch: { isPinching: false, position: null }
      },
      rightHand: {
        gesture: null,
        pinch: { isPinching: false, position: null }
      }
    };

    // Process gestures and landmarks
    if (this.lastResults.landmarks && this.lastResults.landmarks.length > 0) {
      for (let i = 0; i < this.lastResults.landmarks.length; i++) {
        const landmarks = this.lastResults.landmarks[i];
        
        // Determine handedness
        let handedness = 'Unknown';
        if (this.lastResults.handednesses && this.lastResults.handednesses[i] && this.lastResults.handednesses[i].length > 0) {
          handedness = this.lastResults.handednesses[i][0].displayName;
        }

        // Get gesture if available
        let gesture = null;
        if (this.lastResults.gestures && this.lastResults.gestures[i] && this.lastResults.gestures[i].length > 0) {
          const gestureData = this.lastResults.gestures[i][0];
          gesture = {
            name: gestureData.categoryName,
            confidence: gestureData.score
          };
        }

        // Detect pinch
        const pinchData = this.detectPinch(landmarks);

        // Assign to correct hand
        if (handedness === 'Left') {
          detections.leftHand.gesture = gesture;
          detections.leftHand.pinch = pinchData;
        } else if (handedness === 'Right') {
          detections.rightHand.gesture = gesture;
          detections.rightHand.pinch = pinchData;
        }
      }
    }

    return detections;
  }

  getEmptyDetections() {
    return {
      leftHand: {
        gesture: null,
        pinch: { isPinching: false, position: null }
      },
      rightHand: {
        gesture: null,
        pinch: { isPinching: false, position: null }
      }
    };
  }

  // Utility method to convert normalized coordinates to screen/canvas coordinates
  normalizedToScreen(normalizedCoord, screenWidth, screenHeight) {
    return {
      x: normalizedCoord.x * screenWidth,
      y: normalizedCoord.y * screenHeight,
      z: normalizedCoord.z
    };
  }

  // Stop webcam and cleanup
  stop() {
    if (this.video && this.video.srcObject) {
      const tracks = this.video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.video.srcObject = null;
    }
    this.webcamRunning = false;
  }

  // Set pinch sensitivity (smaller values = more sensitive)
  setPinchThreshold(threshold) {
    this.pinchThreshold = threshold;
  }
}

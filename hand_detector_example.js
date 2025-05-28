// Example usage of HandDetector class
// This file demonstrates how to use the HandDetector independently

import { HandDetector } from "./hand_detector.js";

// Initialize the detector
const handDetector = new HandDetector();

async function initializeHandDetection() {
  console.log("Initializing hand detection...");

  // Initialize the detector
  const success = await handDetector.initialize();
  if (!success) {
    console.error("Failed to initialize hand detector");
    return;
  }

  // Start webcam
  const webcamStarted = await handDetector.startWebcam();
  if (!webcamStarted) {
    console.error("Failed to start webcam");
    return;
  }

  console.log("Hand detection ready!");

  // Start polling for detections
  startDetectionLoop();
}

function startDetectionLoop() {
  function pollDetections() {
    const detections = handDetector.getDetections();

    // Log current detections
    console.log("Current detections:", {
      leftHand: {
        gesture: detections.leftHand.gesture?.name || "None",
        confidence: detections.leftHand.gesture?.confidence || 0,
        pinching: detections.leftHand.pinch.isPinching,
        pinchPosition: detections.leftHand.pinch.position,
      },
      rightHand: {
        gesture: detections.rightHand.gesture?.name || "None",
        confidence: detections.rightHand.gesture?.confidence || 0,
        pinching: detections.rightHand.pinch.isPinching,
        pinchPosition: detections.rightHand.pinch.position,
      },
    });

    // Example interactions based on detections
    handleDetections(detections);

    // Continue polling
    setTimeout(pollDetections, 100); // Poll every 100ms
  }

  pollDetections();
}

function handleDetections(detections) {
  // Example: React to pinch gestures
  if (detections.rightHand.pinch.isPinching) {
    console.log("Right hand is pinching at:", detections.rightHand.pinch.position);
    // You could use this position to control cursor, select objects, etc.
  }

  if (detections.leftHand.pinch.isPinching) {
    console.log("Left hand is pinching at:", detections.leftHand.pinch.position);
  }

  // Example: React to specific gestures
  if (detections.rightHand.gesture?.name === "Thumb_Up") {
    console.log("👍 Thumbs up detected!");
  }

  if (detections.leftHand.gesture?.name === "Victory") {
    console.log("✌️ Peace sign detected!");
  }

  if (detections.rightHand.gesture?.name === "Open_Palm") {
    console.log("🖐️ Open palm detected!");
  }
}

// Advanced usage: Convert normalized coordinates to screen coordinates
function convertToScreenCoordinates(
  normalizedPosition,
  screenWidth = window.innerWidth,
  screenHeight = window.innerHeight
) {
  if (!normalizedPosition) return null;

  return handDetector.normalizedToScreen(normalizedPosition, screenWidth, screenHeight);
}

// Example: Use pinch position to control something on screen
function usePinchAsCursor(detections) {
  const rightPinch = detections.rightHand.pinch;

  if (rightPinch.isPinching) {
    const screenPos = convertToScreenCoordinates(rightPinch.position);
    if (screenPos) {
      console.log(`Cursor at screen position: (${screenPos.x}, ${screenPos.y})`);
      // You could move a visual cursor, select elements, etc.
    }
  }
}

// Configuration examples
function configureDetector() {
  // Adjust pinch sensitivity (default is 0.05)
  handDetector.setPinchThreshold(0.03); // More sensitive
  // handDetector.setPinchThreshold(0.08); // Less sensitive
}

// Cleanup function
function cleanup() {
  handDetector.stop();
  console.log("Hand detection stopped");
}

// Export for use in other modules
export {
  initializeHandDetection,
  handleDetections,
  convertToScreenCoordinates,
  usePinchAsCursor,
  configureDetector,
  cleanup,
};

// Auto-initialize if this is the main module
if (import.meta.url === window.location.href) {
  initializeHandDetection();
}

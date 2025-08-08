// --- DOM Elements ---
const startMicButton = document.getElementById("start-mic");
const stopMicButton = document.getElementById("stop-mic");
const micStatus = document.getElementById("mic-status");

// --- Effect Controls & Displays ---

// Dry Level
const micVolumeSlider = document.getElementById("mic-volume");
const micVolumeValue = document.getElementById("mic-volume-value");

// EQ
const eqLowSlider = document.getElementById("eq-low");
const eqLowValue = document.getElementById("eq-low-value");
const eqMidSlider = document.getElementById("eq-mid");
const eqMidValue = document.getElementById("eq-mid-value");
const eqHighSlider = document.getElementById("eq-high");
const eqHighValue = document.getElementById("eq-high-value");

// Chorus
const chorusWetSlider = document.getElementById("chorus-wet");
const chorusWetValue = document.getElementById("chorus-wet-value");
const chorusRateSlider = document.getElementById("chorus-rate");
const chorusRateValue = document.getElementById("chorus-rate-value");
const chorusDepthSlider = document.getElementById("chorus-depth");
const chorusDepthValue = document.getElementById("chorus-depth-value");

// Pitch Shift
const pitchWetSlider = document.getElementById("pitch-wet");
const pitchWetValue = document.getElementById("pitch-wet-value");
const pitchShiftSlider = document.getElementById("pitch-shift");
const pitchShiftValue = document.getElementById("pitch-shift-value");

// Reverb
const reverbLevelSlider = document.getElementById("reverb-level");
const reverbLevelValue = document.getElementById("reverb-level-value");
const reverbDecaySlider = document.getElementById("reverb-decay");
const reverbDecayValue = document.getElementById("reverb-decay-value");

// Echo (Delay)
const echoLevelSlider = document.getElementById("echo-level");
const echoLevelValue = document.getElementById("echo-level-value");
const echoTimeSlider = document.getElementById("echo-time");
const echoTimeValue = document.getElementById("echo-time-value");
const echoFeedbackSlider = document.getElementById("echo-feedback");
const echoFeedbackValue = document.getElementById("echo-feedback-value");
const echoToneSlider = document.getElementById("echo-tone");
const echoToneValue = document.getElementById("echo-tone-value");

// --- All Sliders Array ---
const allSliders = [
  micVolumeSlider,
  eqLowSlider,
  eqMidSlider,
  eqHighSlider,
  chorusWetSlider,
  chorusRateSlider,
  chorusDepthSlider,
  pitchWetSlider,
  pitchShiftSlider,
  reverbLevelSlider,
  reverbDecaySlider,
  echoLevelSlider,
  echoTimeSlider,
  echoFeedbackSlider,
  echoToneSlider,
];

// --- Audio Context and Nodes (using Tone.js) ---
let micStream = null;
let inputFilter = null; // Tone.Filter
let compressor = null; // Tone.Compressor
let equalizer = null; // Tone.EQ3
let chorus = null; // Tone.Chorus
let pitchShift = null; // Tone.PitchShift
let reverb = null; // Tone.Reverb
let feedbackDelay = null; // Tone.FeedbackDelay (Echo)
let dryGain = null; // Tone.Gain for dry signal
let fxChainInput = null; // Tone.Gain to feed the parallel FX chain
let micToneSource = null; // Tone.UserMedia instance

// --- Microphone Monitoring & FX ---
async function startMonitoring() {
  // Ensure Tone.js context is running. This is crucial for mobile.
  // Tone.start() needs to be called after a user gesture.
  if (Tone.context.state !== "running") {
    try {
      await Tone.start();
      console.log(
        "Tone.js AudioContext resumed/started. State:",
        Tone.context.state
      );
    } catch (e) {
      console.error("Error starting Tone.js AudioContext:", e);
      updateMonitoringUI(
        false,
        "Error starting audio. Please tap 'Start Monitoring' again."
      );
      return;
    }
  }

  if (micStream) {
    console.log("Already monitoring. Skipping start.");
    return; // Already monitoring
  }

  console.log("Attempting to start monitoring...");

  try {
    // 1. Get Microphone Stream
    // Request audio with specific constraints for better mobile performance and less issues
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // On mobile, sampleRate can be ignored, or set to a common rate like 44100 or 48000
        // latencyHint: 'interactive' is important for real-time processing
        latencyHint: "interactive",
      },
      video: false,
    });
    console.log("Microphone stream obtained.");

    // 2. Create and Connect Tone.js Audio Nodes
    // Use Tone.UserMedia for input, which handles the MediaStreamSourceNode internally
    micToneSource = new Tone.UserMedia();
    await micToneSource.open(); // Open the UserMedia node to connect to the stream

    // Initial processing stage
    inputFilter = new Tone.Filter(80, "highpass"); // Cut rumble
    compressor = new Tone.Compressor(-20, 4); // Gentle compression

    // EQ
    equalizer = new Tone.EQ3({
      low: parseFloat(eqLowSlider.value),
      mid: parseFloat(eqMidSlider.value),
      high: parseFloat(eqHighSlider.value),
      lowFrequency: 250, // Define frequency bands
      highFrequency: 4000,
    });

    // Dry Path Gain
    dryGain = new Tone.Gain(parseFloat(micVolumeSlider.value));

    // FX Chain Input Gain (to feed parallel effects)
    fxChainInput = new Tone.Gain(1.0); // Start at full volume for FX chain

    // Modulation Effects
    chorus = new Tone.Chorus({
      frequency: parseFloat(chorusRateSlider.value),
      depth: parseFloat(chorusDepthSlider.value),
      wet: parseFloat(chorusWetSlider.value),
      delayTime: 3.5, // Default, can be adjusted
      type: "sine",
    });

    pitchShift = new Tone.PitchShift({
      pitch: parseFloat(pitchShiftSlider.value), // In semitones
      wet: parseFloat(pitchWetSlider.value),
      windowSize: 0.1, // Default, adjusts quality/latency
    });

    // Time-Based Effects
    reverb = new Tone.Reverb({
      decay: parseFloat(reverbDecaySlider.value),
      wet: parseFloat(reverbLevelSlider.value),
      preDelay: 0.015,
    });
    await reverb.generate(); // Pre-generate impulse response for better performance

    feedbackDelay = new Tone.FeedbackDelay({
      delayTime: parseFloat(echoTimeSlider.value),
      feedback: parseFloat(echoFeedbackSlider.value),
      wet: parseFloat(echoLevelSlider.value),
      maxDelay: 1.5,
    });
    // Connect a filter to the feedback loop of the delay for tone control
    const echoFilter = new Tone.Filter(
      parseFloat(echoToneSlider.value),
      "lowpass"
    );
    // feedbackDelay.feedback.connect(echoFilter); // Filter controls the tone of the echo feedback
    // echoFilter.connect(feedbackDelay.input); // Connect the filtered feedback back to delay input

    // Connect Audio Graph
    // Mic Input -> Filter -> Compressor -> EQ
    micToneSource.connect(inputFilter);
    inputFilter.connect(compressor);
    compressor.connect(equalizer);

    // EQ -> Dry Path -> Master Output
    equalizer.connect(dryGain);
    dryGain.toDestination(); // Send dry signal to speakers

    // EQ -> FX Chain Input (for parallel effects)
    equalizer.connect(fxChainInput);

    // Connect FX in series for the wet path, then send to destination
    // The chain ensures the signal flows through each effect one after another.
    // If you wanted parallel effects, you'd need to fan out from fxChainInput.
    fxChainInput.chain(
      chorus,
      pitchShift,
      reverb,
      feedbackDelay,
      echoFilter,
      Tone.Destination // Send processed wet signal to speakers
    );

    console.log("Audio graph connected.");

    // 3. Update UI
    updateMonitoringUI(true);
    updateAllSliderValues();
    console.log("Monitoring started successfully.");
  } catch (error) {
    console.error("Error starting monitoring:", error);
    let message = `Error: ${error.message}`;
    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      message =
        "Microphone access denied. Please allow microphone permissions in your browser settings.";
    } else if (
      error.name === "NotFoundError" ||
      error.name === "DevicesNotFoundError"
    ) {
      message =
        "No microphone found. Please ensure one is connected and enabled.";
    } else if (error.name === "NotReadableError") {
      message =
        "Microphone is already in use by another application or device.";
    }
    updateMonitoringUI(false, message);
    stopMonitoring(); // Clean up on error
  }
}

function stopMonitoring() {
  console.log("Stopping monitoring...");

  // 1. Stop Mic Stream Tracks
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    console.log("Microphone tracks stopped.");
  }

  // 2. Dispose Tone.js Nodes
  // Dispose all created Tone.js nodes to release resources
  if (micToneSource) {
    micToneSource.close(); // Close the UserMedia node
    micToneSource.dispose();
  }
  if (inputFilter) inputFilter.dispose();
  if (compressor) compressor.dispose();
  if (equalizer) equalizer.dispose();
  if (dryGain) dryGain.dispose();
  if (fxChainInput) fxChainInput.dispose();
  if (chorus) chorus.dispose();
  if (pitchShift) pitchShift.dispose();
  if (reverb) reverb.dispose();
  if (feedbackDelay) feedbackDelay.dispose();

  // 3. Clear References
  micStream = null;
  micToneSource = null;
  inputFilter = null;
  compressor = null;
  equalizer = null;
  dryGain = null;
  fxChainInput = null;
  chorus = null;
  pitchShift = null;
  reverb = null;
  feedbackDelay = null;

  // 4. Update UI
  updateMonitoringUI(false);
  console.log("Monitoring stopped and resources released.");
}

// --- Slider Event Listeners & Value Updates ---

function updateSliderValue(slider, display, units = "", decimalPlaces = 2) {
  const value = parseFloat(slider.value);
  let displayValue;

  if (
    units.trim().toLowerCase() === "hz" ||
    units.trim().toLowerCase() === "semitones"
  ) {
    displayValue = value.toFixed(0); // No decimals for Hz or semitones
  } else if (units.trim().toLowerCase() === "db") {
    displayValue = value.toFixed(1); // 1 decimal for dB
  } else if (units.trim().toLowerCase() === "s") {
    displayValue = value.toFixed(decimalPlaces); // Keep decimals for seconds
  } else {
    displayValue = value.toFixed(decimalPlaces); // Default
  }

  display.textContent = displayValue + units;
}

function updateAllSliderValues() {
  // Dry
  updateSliderValue(micVolumeSlider, micVolumeValue);
  // EQ
  updateSliderValue(eqLowSlider, eqLowValue, " dB", 1);
  updateSliderValue(eqMidSlider, eqMidValue, " dB", 1);
  updateSliderValue(eqHighSlider, eqHighValue, " dB", 1);
  // Chorus
  updateSliderValue(chorusWetSlider, chorusWetValue);
  updateSliderValue(chorusRateSlider, chorusRateValue, " Hz", 1);
  updateSliderValue(chorusDepthSlider, chorusDepthValue);
  // Pitch Shift
  updateSliderValue(pitchWetSlider, pitchWetValue);
  updateSliderValue(pitchShiftSlider, pitchShiftValue, " semitones");
  // Reverb
  updateSliderValue(reverbLevelSlider, reverbLevelValue);
  updateSliderValue(reverbDecaySlider, reverbDecayValue, "s", 1);
  // Echo
  updateSliderValue(echoLevelSlider, echoLevelValue);
  updateSliderValue(echoTimeSlider, echoTimeValue, "s");
  updateSliderValue(echoFeedbackSlider, echoFeedbackValue);
  updateSliderValue(echoToneSlider, echoToneValue, " Hz");
}

// --- Event Listeners for Controls ---
const RAMP_TIME = 0.05; // 50ms ramp for smooth changes

// Dry Level
micVolumeSlider.addEventListener("input", () => {
  updateSliderValue(micVolumeSlider, micVolumeValue);
  if (dryGain)
    dryGain.gain.rampTo(parseFloat(micVolumeSlider.value), RAMP_TIME);
});

// EQ
eqLowSlider.addEventListener("input", () => {
  updateSliderValue(eqLowSlider, eqLowValue, " dB", 1);
  if (equalizer) equalizer.low.rampTo(parseFloat(eqLowSlider.value), RAMP_TIME);
});
eqMidSlider.addEventListener("input", () => {
  updateSliderValue(eqMidSlider, eqMidValue, " dB", 1);
  if (equalizer) equalizer.mid.rampTo(parseFloat(eqMidSlider.value), RAMP_TIME);
});
eqHighSlider.addEventListener("input", () => {
  updateSliderValue(eqHighSlider, eqHighValue, " dB", 1);
  if (equalizer)
    equalizer.high.rampTo(parseFloat(eqHighSlider.value), RAMP_TIME);
});

// Chorus
chorusWetSlider.addEventListener("input", () => {
  updateSliderValue(chorusWetSlider, chorusWetValue);
  if (chorus) chorus.wet.rampTo(parseFloat(chorusWetSlider.value), RAMP_TIME);
});
chorusRateSlider.addEventListener("input", () => {
  updateSliderValue(chorusRateSlider, chorusRateValue, " Hz", 1);
  if (chorus)
    chorus.frequency.rampTo(parseFloat(chorusRateSlider.value), RAMP_TIME);
});
chorusDepthSlider.addEventListener("input", () => {
  updateSliderValue(chorusDepthSlider, chorusDepthValue);
  if (chorus)
    chorus.depth.rampTo(parseFloat(chorusDepthSlider.value), RAMP_TIME);
});

// Pitch Shift
pitchWetSlider.addEventListener("input", () => {
  updateSliderValue(pitchWetSlider, pitchWetValue);
  if (pitchShift)
    pitchShift.wet.rampTo(parseFloat(pitchWetSlider.value), RAMP_TIME);
});
pitchShiftSlider.addEventListener("input", () => {
  updateSliderValue(pitchShiftSlider, pitchShiftValue, " semitones");
  // Pitch shift usually changes instantly, no rampTo needed for pitch itself
  if (pitchShift) pitchShift.pitch = parseFloat(pitchShiftSlider.value);
});

// Reverb
reverbLevelSlider.addEventListener("input", () => {
  updateSliderValue(reverbLevelSlider, reverbLevelValue);
  if (reverb) reverb.wet.rampTo(parseFloat(reverbLevelSlider.value), RAMP_TIME);
});
reverbDecaySlider.addEventListener("input", () => {
  updateSliderValue(reverbDecaySlider, reverbDecayValue, "s", 1);
  // Changing decay might ideally require regeneration, but Tone.js allows direct change.
  if (reverb) {
    reverb.decay = parseFloat(reverbDecaySlider.value);
  }
});

// Echo (Delay)
echoLevelSlider.addEventListener("input", () => {
  updateSliderValue(echoLevelSlider, echoLevelValue);
  if (feedbackDelay)
    feedbackDelay.wet.rampTo(parseFloat(echoLevelSlider.value), RAMP_TIME);
});
echoTimeSlider.addEventListener("input", () => {
  updateSliderValue(echoTimeSlider, echoTimeValue, "s");
  if (feedbackDelay)
    feedbackDelay.delayTime.rampTo(parseFloat(echoTimeSlider.value), RAMP_TIME);
});
echoFeedbackSlider.addEventListener("input", () => {
  updateSliderValue(echoFeedbackSlider, echoFeedbackValue);
  if (feedbackDelay)
    feedbackDelay.feedback.rampTo(
      parseFloat(echoFeedbackSlider.value),
      RAMP_TIME
    );
});
echoToneSlider.addEventListener("input", () => {
  updateSliderValue(echoToneSlider, echoToneValue, " Hz");
  // Access the filter connected to the feedback loop of the delay
  if (echoFilter) {
    echoFilter.frequency.rampTo(parseFloat(echoToneSlider.value), RAMP_TIME);
  }
});

// --- Button Listeners ---
startMicButton.addEventListener("click", startMonitoring);
stopMicButton.addEventListener("click", stopMonitoring);

// --- UI Update Function ---
function updateMonitoringUI(isMonitoring, message = "") {
  // This function handles enabling/disabling buttons and sliders,
  // and updating the status message and its color.
  if (isMonitoring) {
    micStatus.textContent = "Monitoring is ON";
    micStatus.classList.remove(
      "bg-gray-100",
      "text-gray-600",
      "bg-red-100",
      "text-red-800"
    );
    micStatus.classList.add("bg-green-100", "text-green-800");
    startMicButton.disabled = true;
    stopMicButton.disabled = false;
    allSliders.forEach((slider) => (slider.disabled = false));
  } else {
    micStatus.textContent = message || "Monitoring is OFF";
    if (
      message &&
      (message.toLowerCase().includes("error") ||
        message.toLowerCase().includes("denied") ||
        message.toLowerCase().includes("no microphone") ||
        message.toLowerCase().includes("in use"))
    ) {
      micStatus.classList.remove(
        "bg-gray-100",
        "text-gray-600",
        "bg-green-100",
        "text-green-800"
      );
      micStatus.classList.add("bg-red-100", "text-red-800");
    } else {
      micStatus.classList.remove(
        "bg-green-100",
        "text-green-800",
        "bg-red-100",
        "text-red-800"
      );
      micStatus.classList.add("bg-gray-100", "text-gray-600");
    }
    startMicButton.disabled = false;
    stopMicButton.disabled = true;
    allSliders.forEach((slider) => (slider.disabled = true));
  }
}

// --- Initial Page Load Setup ---
window.addEventListener("load", () => {
  // Initialize Tone.js. It won't start the audio context until a user gesture,
  // but this ensures Tone.js is ready for when that gesture happens.
  Tone.context.lookAhead = 0.05; // Reduce latency slightly
  Tone.context.latencyHint = "interactive"; // Set latency hint for real-time audio

  updateMonitoringUI(false); // Set initial UI state
  updateAllSliderValues(); // Set initial display values
  console.log("Voice FX Processor loaded. Ready for user interaction.");
});

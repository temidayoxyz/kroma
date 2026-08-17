import './style.css'

// ── Web Audio API Engine & Oscilloscope ──

let audioCtx = null
let masterGain = null
let filterNode = null
let analyserNode = null
let activeOscillator = null
let isAudioRunning = false

let synthParams = {
  waveform: 'sawtooth',
  octave: 0,
  cutoff: 2400,
  resonance: 4.2,
  attack: 0.05,
  volume: 0.75
}

function initAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()

      // Master Gain
      masterGain = audioCtx.createGain()
      masterGain.gain.setValueAtTime(synthParams.volume, audioCtx.currentTime)

      // 24dB Biquad Lowpass Filter
      filterNode = audioCtx.createBiquadFilter()
      filterNode.type = 'lowpass'
      filterNode.frequency.setValueAtTime(synthParams.cutoff, audioCtx.currentTime)
      filterNode.Q.setValueAtTime(synthParams.resonance, audioCtx.currentTime)

      // Analyser for real-time oscilloscope
      analyserNode = audioCtx.createAnalyser()
      analyserNode.fftSize = 2048

      // Routing: Synth Voice -> Filter -> MasterGain -> Analyser -> Destination
      filterNode.connect(masterGain)
      masterGain.connect(analyserNode)
      analyserNode.connect(audioCtx.destination)

      isAudioRunning = true
      updateEngineStatus(true)
      startOscilloscope()
    }
  }

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
    isAudioRunning = true
    updateEngineStatus(true)
  }
}

function updateEngineStatus(active) {
  const indicator = document.getElementById('audioEngineStatus')
  const statusLabel = document.getElementById('statusLabel')
  if (indicator && statusLabel) {
    if (active) {
      indicator.classList.add('active')
      statusLabel.textContent = `ENGINE ${Math.round((audioCtx?.sampleRate || 48000) / 1000)}kHz`
    }
  }
}

function playNote(frequency) {
  initAudioContext()
  if (!audioCtx) return

  // Stop previous note if monophonic
  if (activeOscillator) {
    try {
      activeOscillator.stop()
      activeOscillator.disconnect()
    } catch {
      // Ignored if already stopped
    }
  }

  // Calculate octave-shifted frequency
  const shiftedFreq = frequency * Math.pow(2, synthParams.octave)

  // Update frequency display
  const freqDisplay = document.getElementById('freqDisplay')
  if (freqDisplay) {
    freqDisplay.textContent = `${shiftedFreq.toFixed(1)} Hz`
  }

  // Create oscillator
  const osc = audioCtx.createOscillator()
  const voiceGain = audioCtx.createGain()

  osc.type = synthParams.waveform
  osc.frequency.setValueAtTime(shiftedFreq, audioCtx.currentTime)

  // Fast Attack Envelope
  voiceGain.gain.setValueAtTime(0.001, audioCtx.currentTime)
  voiceGain.gain.exponentialRampToValueAtTime(1.0, audioCtx.currentTime + synthParams.attack)

  osc.connect(voiceGain)
  voiceGain.connect(filterNode)

  osc.start()
  activeOscillator = osc

  return { osc, voiceGain }
}

function stopNote(voice) {
  if (!audioCtx || !voice) return
  const { osc, voiceGain } = voice
  try {
    const releaseTime = 0.15
    voiceGain.gain.setValueAtTime(voiceGain.gain.value, audioCtx.currentTime)
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + releaseTime)
    setTimeout(() => {
      try {
        osc.stop()
        osc.disconnect()
        voiceGain.disconnect()
      } catch {
        // Safe disconnect
      }
    }, releaseTime * 1000 + 50)
  } catch {
    // Graceful fallback
  }
}

// ── Real-time Oscilloscope Canvas ──

function startOscilloscope() {
  const canvas = document.getElementById('oscilloscope')
  if (!canvas || !analyserNode) return

  const ctx = canvas.getContext('2d')
  const bufferLength = analyserNode.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)

  function draw() {
    requestAnimationFrame(draw)

    analyserNode.getByteTimeDomainData(dataArray)

    // Clear background
    ctx.fillStyle = '#080A0B'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw technical grid lines
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(43, 48, 55, 0.4)'
    ctx.beginPath()

    // Horizontal grid
    for (let y = 30; y < canvas.height; y += 30) {
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
    }
    // Vertical grid
    for (let x = 40; x < canvas.width; x += 40) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
    }
    ctx.stroke()

    // Draw green phosphor waveform
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#00E599'
    ctx.shadowBlur = 8
    ctx.shadowColor = 'rgba(0, 229, 153, 0.8)'

    ctx.beginPath()
    const sliceWidth = (canvas.width * 1.0) / bufferLength
    let x = 0

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0
      const y = (v * canvas.height) / 2

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }

      x += sliceWidth
    }

    ctx.stroke()
    ctx.shadowBlur = 0 // Reset glow for next frame
  }

  draw()
}

// ── UI Controls & Event Listeners ──

function initControls() {
  // Waveform selector buttons
  const waveBtns = document.querySelectorAll('.wave-btn')
  waveBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      waveBtns.forEach(b => {
        b.classList.remove('active')
        b.setAttribute('aria-pressed', 'false')
      })
      btn.classList.add('active')
      btn.setAttribute('aria-pressed', 'true')
      synthParams.waveform = btn.dataset.wave || 'sawtooth'
    })
  })

  // Octave slider
  const octaveSlider = document.getElementById('octaveSlider')
  const octaveVal = document.getElementById('octaveVal')
  if (octaveSlider && octaveVal) {
    octaveSlider.addEventListener('input', e => {
      synthParams.octave = parseInt(e.target.value, 10)
      octaveVal.textContent = (synthParams.octave > 0 ? '+' : '') + synthParams.octave
    })
  }

  // Filter Cutoff slider
  const cutoffSlider = document.getElementById('cutoffSlider')
  const cutoffVal = document.getElementById('cutoffVal')
  if (cutoffSlider && cutoffVal) {
    cutoffSlider.addEventListener('input', e => {
      synthParams.cutoff = parseFloat(e.target.value)
      cutoffVal.textContent = `${Math.round(synthParams.cutoff)} Hz`
      if (filterNode && audioCtx) {
        filterNode.frequency.setValueAtTime(synthParams.cutoff, audioCtx.currentTime)
      }
    })
  }

  // Resonance slider
  const resoSlider = document.getElementById('resoSlider')
  const resoVal = document.getElementById('resoVal')
  if (resoSlider && resoVal) {
    resoSlider.addEventListener('input', e => {
      synthParams.resonance = parseFloat(e.target.value)
      resoVal.textContent = synthParams.resonance.toFixed(1)
      if (filterNode && audioCtx) {
        filterNode.Q.setValueAtTime(synthParams.resonance, audioCtx.currentTime)
      }
    })
  }

  // Attack slider
  const attackSlider = document.getElementById('attackSlider')
  const attackVal = document.getElementById('attackVal')
  if (attackSlider && attackVal) {
    attackSlider.addEventListener('input', e => {
      synthParams.attack = parseFloat(e.target.value)
      attackVal.textContent = `${synthParams.attack.toFixed(2)} s`
    })
  }

  // Volume slider
  const volumeSlider = document.getElementById('volumeSlider')
  const volumeVal = document.getElementById('volumeVal')
  if (volumeSlider && volumeVal) {
    volumeSlider.addEventListener('input', e => {
      const vol = parseInt(e.target.value, 10)
      synthParams.volume = vol / 100
      volumeVal.textContent = `${vol}%`
      if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(synthParams.volume, audioCtx.currentTime)
      }
    })
  }

  // Keyboard triggering (Mouse & Touch)
  const keys = document.querySelectorAll('.key')
  let activeVoices = new Map()

  keys.forEach(key => {
    const freq = parseFloat(key.dataset.note)

    const handlePress = (e) => {
      e.preventDefault()
      key.classList.add('active')
      const voice = playNote(freq)
      if (voice) {
        activeVoices.set(key, voice)
      }
    }

    const handleRelease = (e) => {
      e.preventDefault()
      key.classList.remove('active')
      const voice = activeVoices.get(key)
      if (voice) {
        stopNote(voice)
        activeVoices.delete(key)
      }
    }

    key.addEventListener('mousedown', handlePress)
    key.addEventListener('mouseup', handleRelease)
    key.addEventListener('mouseleave', handleRelease)

    key.addEventListener('touchstart', handlePress, { passive: false })
    key.addEventListener('touchend', handleRelease)
    key.addEventListener('touchcancel', handleRelease)
  })

  // Physical computer keyboard triggers
  const keyMap = {
    'a': 261.63, // C4
    'w': 277.18, // C#4
    's': 293.66, // D4
    'e': 311.13, // D#4
    'd': 329.63, // E4
    'f': 349.23, // F4
    't': 369.99, // F#4
    'g': 392.00, // G4
    'y': 415.30, // G#4
    'h': 440.00, // A4
    'u': 466.16, // A#4
    'j': 493.88, // B4
    'k': 523.25  // C5
  }

  const activeKeyNotes = new Map()

  window.addEventListener('keydown', (e) => {
    // Ignore if typing in form inputs
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      return
    }

    const char = e.key.toLowerCase()
    if (keyMap[char] && !activeKeyNotes.has(char)) {
      const keyElem = Array.from(keys).find(k => k.dataset.key?.toLowerCase() === char)
      if (keyElem) keyElem.classList.add('active')
      const voice = playNote(keyMap[char])
      if (voice) {
        activeKeyNotes.set(char, voice)
      }
    }
  })

  window.addEventListener('keyup', (e) => {
    const char = e.key.toLowerCase()
    if (activeKeyNotes.has(char)) {
      const keyElem = Array.from(keys).find(k => k.dataset.key?.toLowerCase() === char)
      if (keyElem) keyElem.classList.remove('active')
      const voice = activeKeyNotes.get(char)
      stopNote(voice)
      activeKeyNotes.delete(char)
    }
  })

  // Mobile menu toggle
  const mobileToggle = document.getElementById('mobileToggle')
  const mainNav = document.getElementById('mainNav')

  if (mobileToggle && mainNav) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('open')
      mobileToggle.setAttribute('aria-expanded', isOpen)
    })

    mainNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('open')
        mobileToggle.setAttribute('aria-expanded', 'false')
      })
    })
  }

  // Commission Form handling
  const form = document.getElementById('commissionForm')
  const feedback = document.getElementById('formFeedback')

  if (form && feedback) {
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const btn = form.querySelector('.btn--submit')
      btn.textContent = 'COMMISSION RECEIVED'
      btn.disabled = true
      feedback.textContent = 'Thank you. A laboratory master technician will contact you within 24 working hours.'
      feedback.style.color = 'var(--accent-green)'
      form.reset()
    })
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initControls()
})

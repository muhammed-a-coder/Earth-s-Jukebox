# Earth Jukebox

**See the universe with your ears.**

A voice-first 3D explorer of Earth and the universe, built for the **NASA Space Apps Challenge 2026** challenge *The Earth Information Jukebox*. Search for anything, and Earth Jukebox builds a realistic 3D scene from live NASA data while an on-device AI guide explains it aloud in a natural human voice. It is designed from the first line of code for blind and low-vision explorers.

> Independent project built for the challenge. It is not an official NASA product and NASA has not endorsed it.

![Earth Jukebox home screen](docs/screenshots/home.png)

**Live demo:** [add your deployed URL here]
**Demo video:** [add your video link here]

---

## The problem

NASA's Earth Information Center (EIC) produces stunning visualizations of our changing planet, but they are almost entirely visual. That shuts out blind and low-vision users and limits how the public can explore complex Earth science.

## Our solution

Earth Jukebox turns "looking at data" into "listening to a story":

1. **Search** anything by typing or speaking: a planet, a moon, a solar eclipse, an aurora, the inner core of the Earth.
2. **NASA data** is fetched live from NASA's own services, not stored locally.
3. A **3D scene** is built from real NASA imagery and textures, and the camera orbits it automatically.
4. A **side panel** slides in with a NASA photo, key facts, the last and next dates (when they apply), and an AI briefing.
5. A **natural voice** reads the result aloud, and you can ask the AI follow-up questions by voice or text.

![Solar eclipse search](docs/screenshots/eclipse.png)

## Features

- **Search-driven universe.** Nothing is limited to a fixed list of scenes; any query is resolved through NASA data.
- **Realistic 3D scenes.** Earth uses NASA Blue Marble style imagery with clouds, night lights and atmosphere glow. Other worlds use real NASA/JPL textures and real moon data.
- **Orbiting camera with scrubbing.** The camera circles the subject on its own. Hold the mouse (or touch) to pause it and scrub clockwise or counterclockwise along the same path. There is no free-roaming camera, so nobody gets lost.
- **On-device AI, no API key.** A real language model runs inside the browser with WebLLM and WebGPU. No cloud AI, no backend, and nothing you type is sent to an AI company.
- **Grounded answers.** The AI is given the NASA description and event data for each search, so it explains real facts instead of inventing them.
- **Human-sounding voice.** A neural text-to-speech model runs locally in the browser, with a speaker toggle to mute, stop or resume.
- **Voice input.** Push-to-talk speech recognition for searching and chatting.
- **Accessibility first.** Keyboard control, screen-reader labels, live announcements, and spoken descriptions of what is on screen.
- **Graceful fallbacks.** If WebGPU is unavailable, the app falls back to a smaller WASM model and finally to pre-written briefings for common searches so it always works.

![Jupiter search](docs/screenshots/jupiter.png)

## How it works

```
Search (typed or spoken)
   -> AI classifies the query (planet, moon, event, Earth phenomenon, ...)
   -> Live fetch of NASA images, facts and orbital data
   -> Most realistic available 3D representation is rendered
   -> On-device AI writes a spoken-style briefing from the real data
   -> Neural voice reads it aloud; chat is available for follow-ups
```

## Tech stack

| Area | Technology |
| --- | --- |
| App | React, Vite |
| 3D | Three.js |
| On-device AI | WebLLM (MLC) with WebGPU, Qwen2.5 1.5B/3B Instruct chosen by device capability |
| Voice output | Kokoro neural text-to-speech running in the browser |
| Voice input | Web Speech API |
| Accessibility | ARIA labels and live regions, full keyboard support |

## NASA data sources

- [NASA Images and Video Library](https://images.nasa.gov)
- [NASA GIBS (Global Imagery Browse Services)](https://gibs.earthdata.nasa.gov)
- [NASA Scientific Visualization Studio](https://svs.gsfc.nasa.gov)
- [JPL Solar System Dynamics and Horizons](https://ssd.jpl.nasa.gov)
- [NASA Earth Information Center](https://earth.gov) content database

All NASA data is requested live at runtime from NASA's hosts.

## Getting started

### Requirements

- Node.js 18 or newer
- A recent Chrome or Edge (WebGPU) on a reasonably capable laptop for the best experience

### Run locally

```bash
git clone [your repository URL]
cd [your project folder]
npm install
npm run dev
```

Then open <http://localhost:5173>.

### Build for production

```bash
npm run build
npm run preview
```

The build output is a static site that can be hosted on any static host, such as Vercel or Netlify. There is no server and no API key to configure.

## Good to know

- **First visit:** the AI and voice models download once (a few hundred megabytes in total) and are then cached in the browser. A small progress bar shows the download, and you can already search while it loads.
- **Browser support:** WebGPU gives the best speed and quality. Without it the app uses smaller fallback models.
- **Answer quality:** an on-device model is smaller than a cloud model, which is why every briefing is grounded in real NASA data.

## Accessibility

Earth Jukebox is built for blind and low-vision users first:

- Every result is spoken, and speech can be toggled at any time.
- All controls work from the keyboard and are labeled for screen readers.
- The AI can describe what is currently on screen on request.
- The interface is minimal and high contrast, and respects reduced-motion preferences.

## Roadmap

- Sonify the EIC visual frames themselves with real-time generated soundscapes
- More NASA datasets and Earth phenomena
- Multilingual voices and briefings
- Richer descriptive audio for complex visualizations

## Team

[Your team name] - NASA Space Apps Challenge 2026

## Acknowledgments

Imagery, textures and data courtesy of NASA, JPL and the NASA Scientific Visualization Studio. Built for the NASA Space Apps Challenge 2026, which is funded by NASA's Science Mission Directorate.

## License

[Choose a license, for example MIT]

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_IPD_MM,
  distanceFromIpdPx,
  getFaceLandmarker,
  ipdPxFromResult,
} from "@/lib/faceDistance";
import {
  DEFAULT_TARGET_WIDTH_MM,
  distanceFromTargetWidthPx,
  getTargetTracker,
  setTargetFromElement,
  setTargetFromVideoCrop,
  targetWidthPxFromResult,
} from "@/lib/targetDistance";
import {
  generateTarget,
  sampleTarget,
  type Difficulty,
  type MotionMode,
  type TargetGraph,
} from "@/lib/targets";
import {
  linearRegression,
  quadraticRegression,
  type LinearFit,
  type QuadraticFit,
} from "@/lib/regression";
import { Graph, type SeriesPoint } from "@/components/Graph";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Movement Matcher" },
      {
        name: "description",
        content:
          "Match kinematics graphs by moving toward and away from your webcam. In-browser face tracking, live overlays, and regression tools.",
      },
      { property: "og:title", content: "Movement Matcher" },
      {
        property: "og:description",
        content:
          "Match position, velocity, and acceleration graphs using webcam-based distance tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

interface Sample {
  t: number;
  d: number;
}

interface TrialRecord {
  id: number;
  label: string;
  samples: Sample[];
  targetName: string;
  mode: MotionMode;
  difficulty: Difficulty;
}

function pearsonCorrelation(a: SeriesPoint[], b: SeriesPoint[]): number | null {
  if (!a.length || !b.length || a.length !== b.length) return null;
  const meanA = a.reduce((sum, p) => sum + p.y, 0) / a.length;
  const meanB = b.reduce((sum, p) => sum + p.y, 0) / b.length;
  let numerator = 0;
  let sumSqA = 0;
  let sumSqB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diffA = a[i]!.y - meanA;
    const diffB = b[i]!.y - meanB;
    numerator += diffA * diffB;
    sumSqA += diffA * diffA;
    sumSqB += diffB * diffB;
  }
  const denominator = Math.sqrt(sumSqA * sumSqB);
  if (!denominator) return null;
  return numerator / denominator;
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetFileRef = useRef<HTMLInputElement>(null);
  const graphViewRef = useRef<HTMLDivElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [trackingMode, setTrackingMode] = useState<"face" | "target">("face");
  const [targetSet, setTargetSet] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [targetDetected, setTargetDetected] = useState(false);
  const [cropSelection, setCropSelection] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [trialHistory, setTrialHistory] = useState<TrialRecord[]>([]);
  const startTimeRef = useRef<number>(0);
  const samplesRef = useRef<Sample[]>([]);
  const lastDistanceRef = useRef<number | null>(null);

  const [ipdMm, setIpdMm] = useState<number>(DEFAULT_IPD_MM);
  const [focalScale, setFocalScale] = useState<number>(1);
  const [calibKnown, setCalibKnown] = useState<string>("1.0");

  const [mode, setMode] = useState<MotionMode>("position");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [target, setTarget] = useState<TargetGraph>(() => generateTarget("position", "easy"));

  const [timeOffset, setTimeOffset] = useState(0);
  const [distOffset, setDistOffset] = useState(0);
  const [distScale, setDistScale] = useState(1);

  const [region, setRegion] = useState<{ t0: number; t1: number } | null>(null);
  const [regionLinear, setRegionLinear] = useState<LinearFit | null>(null);
  const [regionQuad, setRegionQuad] = useState<QuadraticFit | null>(null);
  const [globalLinear, setGlobalLinear] = useState<LinearFit | null>(null);
  const [globalQuad, setGlobalQuad] = useState<QuadraticFit | null>(null);
  const [activeView, setActiveView] = useState<"instructions" | "settings" | "graph">(
    "instructions",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      if (trackingMode === "face") await getFaceLandmarker();
      else await getTargetTracker();
      setModelReady(true);
    } catch (e) {
      console.error(e);
      alert("Could not access webcam: " + (e as Error).message);
    }
  }, [trackingMode]);

  const changeTrackingMode = useCallback(async (nextMode: "face" | "target") => {
    setTrackingMode(nextMode);
    setModelReady(false);
    setTargetDetected(false);
    setDistance(null);
    try {
      if (nextMode === "face") await getFaceLandmarker();
      else await getTargetTracker();
      setModelReady(true);
    } catch (e) {
      console.error(e);
      alert(`Could not load ${nextMode} tracker: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsGraphFullscreen(Boolean(document.fullscreenElement));
    };
    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleGraphFullscreen = useCallback(() => {
    const el = graphViewRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    if (!cameraOn || !modelReady) return;
    let raf = 0;
    let lastTs = -1;
    const loop = async () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && (trackingMode === "face" || targetSet)) {
        try {
          const ts = performance.now();
          if (ts !== lastTs) {
            const res =
              trackingMode === "face"
                ? (await getFaceLandmarker()).detectForVideo(video, ts)
                : (await getTargetTracker()).detectForVideo(video, ts);
            lastTs = ts;
            const widthPx =
              trackingMode === "face"
                ? ipdPxFromResult(res, video.videoWidth, video.videoHeight)
                : res.targets[0]
                  ? targetWidthPxFromResult(res.targets[0], video.videoWidth, video.videoHeight)
                  : null;
            setTargetDetected(Boolean(widthPx));
            if (widthPx) {
              const d =
                trackingMode === "face"
                  ? distanceFromIpdPx(widthPx, video.videoWidth, ipdMm, focalScale)
                  : distanceFromTargetWidthPx(widthPx, video.videoWidth, ipdMm, focalScale);
              if (Number.isFinite(d) && d > 0) {
                lastDistanceRef.current = d;
                setDistance(d);
                if (recording) {
                  const t = (performance.now() - startTimeRef.current) / 1000;
                  if (t <= target.duration) {
                    const s = { t, d };
                    samplesRef.current.push(s);
                    setSamples([...samplesRef.current]);
                  } else {
                    setRecording(false);
                    finalizeRecording(samplesRef.current);
                  }
                }
              } else if (lastDistanceRef.current !== null && recording) {
                const t = (performance.now() - startTimeRef.current) / 1000;
                if (t <= target.duration) {
                  samplesRef.current.push({ t, d: lastDistanceRef.current });
                  setSamples([...samplesRef.current]);
                } else {
                  setRecording(false);
                  finalizeRecording(samplesRef.current);
                }
              }
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [
    cameraOn,
    modelReady,
    trackingMode,
    targetSet,
    ipdMm,
    focalScale,
    recording,
    target.duration,
  ]);

  const setUploadedTarget = async (file: File) => {
    console.debug("upload target: start", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    try {
      setTargetError(null);
      setTargetSet(false);
      setTargetDetected(false);
      setDistance(null);
      lastDistanceRef.current = null;

      const image = await createImageBitmap(file);
      console.debug("upload target: image bitmap created", {
        width: image.width,
        height: image.height,
      });

      await getTargetTracker();
      console.debug("upload target: tracker ready");
      await setTargetFromElement(image);
      image.close();
      setTargetSet(true);
      console.debug("upload target: success");
    } catch (e) {
      const err = e as Error;
      console.error("upload target: failed", err);
      setTargetSet(false);
      setTargetError(`Could not load target: ${err.message}`);
    }
  };

  const cropCameraTarget = async (selection: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !cameraOn) {
      setCropSelection(null);
      setTargetError("Camera is not ready to select a target region.");
      return;
    }

    try {
      setTargetError(null);
      setTargetSet(false);
      setTargetDetected(false);

      const roi = {
        x: 1 - selection.left - selection.width,
        y: selection.top,
        w: selection.width,
        h: selection.height,
      };

      await getTargetTracker();
      await setTargetFromVideoCrop(video, roi);
      setTargetSet(true);
      const initialWidthPx = selection.width * video.videoWidth;
      const initialDistance = distanceFromTargetWidthPx(
        initialWidthPx,
        video.videoWidth,
        ipdMm,
        focalScale,
      );
      if (Number.isFinite(initialDistance) && initialDistance > 0) {
        lastDistanceRef.current = initialDistance;
        setDistance(initialDistance);
      }
    } catch (e) {
      setTargetSet(false);
      setTargetError(`Could not crop target: ${(e as Error).message}`);
    }
  };

  const handleCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    cropStartRef.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    setCropSelection({
      left: cropStartRef.current.x,
      top: cropStartRef.current.y,
      width: 0,
      height: 0,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = cropStartRef.current;
    if (!start) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    const y = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    setCropSelection({
      left: Math.min(start.x, x),
      top: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    });
  };

  const handleCropPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const selection = cropSelection;
    cropStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!selection || selection.width < 12 || selection.height < 12) {
      setCropSelection(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalized = {
      left: selection.left / bounds.width,
      top: selection.top / bounds.height,
      width: selection.width / bounds.width,
      height: selection.height / bounds.height,
    };
    setCropSelection(null);
    void cropCameraTarget(normalized);
  };

  const resetActiveTrial = useCallback(() => {
    samplesRef.current = [];
    lastDistanceRef.current = null;
    setRecording(false);
    setSamples([]);
    setRegion(null);
    setRegionLinear(null);
    setRegionQuad(null);
    setGlobalLinear(null);
    setGlobalQuad(null);
    setTimeOffset(0);
    setDistOffset(0);
    setDistScale(1);
  }, []);

  const beginNewTrial = useCallback(() => {
    resetActiveTrial();
    startTimeRef.current = performance.now();
    setRecording(true);
  }, [resetActiveTrial]);

  const startRecording = () => {
    beginNewTrial();
  };

  const buildUserSeriesForSamples = useCallback(
    (inputSamples: Sample[]) => {
      const pos = inputSamples.map((s) => ({
        t: s.t + timeOffset,
        y: s.d * distScale + distOffset,
      }));
      if (mode === "position") return pos;
      const smooth = (arr: SeriesPoint[]) => {
        const out: SeriesPoint[] = [];
        const w = 3;
        for (let i = 0; i < arr.length; i++) {
          let sy = 0,
            n = 0;
          for (let k = -w; k <= w; k++) {
            const j = i + k;
            if (j >= 0 && j < arr.length) {
              sy += arr[j]!.y;
              n++;
            }
          }
          out.push({ t: arr[i]!.t, y: sy / n });
        }
        return out;
      };
      const sm = smooth(pos);
      const vel: SeriesPoint[] = [];
      for (let i = 1; i < sm.length; i++) {
        const a = sm[i - 1]!;
        const b = sm[i]!;
        const dt = b.t - a.t;
        if (dt > 0) vel.push({ t: (a.t + b.t) / 2, y: (b.y - a.y) / dt });
      }
      if (mode === "velocity") return smooth(vel);
      const smv = smooth(vel);
      const acc: SeriesPoint[] = [];
      for (let i = 1; i < smv.length; i++) {
        const a = smv[i - 1]!;
        const b = smv[i]!;
        const dt = b.t - a.t;
        if (dt > 0) acc.push({ t: (a.t + b.t) / 2, y: (b.y - a.y) / dt });
      }
      return smooth(acc);
    },
    [distOffset, distScale, mode, timeOffset],
  );

  const saveCurrentTrial = useCallback(
    (trialSamples?: Sample[]) => {
      const completedSamples =
        trialSamples ?? (samplesRef.current.length ? [...samplesRef.current] : [...samples]);
      if (completedSamples.length) {
        setTrialHistory((prev) => [
          ...prev,
          {
            id: prev.length + 1,
            label: `trial_${prev.length + 1}`,
            samples: completedSamples,
            targetName: target.name,
            mode,
            difficulty,
          },
        ]);
      }
    },
    [difficulty, mode, samples, target.name],
  );

  const finalizeRecording = useCallback(
    (trialSamples?: Sample[]) => {
      const completedSamples = trialSamples ?? [...samplesRef.current];
      if (completedSamples.length) {
        setSamples([...completedSamples]);
        const series = buildUserSeriesForSamples(completedSamples);
        setGlobalLinear(linearRegression(series));
        setGlobalQuad(quadraticRegression(series));
      }
      saveCurrentTrial(completedSamples);
    },
    [buildUserSeriesForSamples, saveCurrentTrial],
  );

  const stopRecording = () => {
    setRecording(false);
    finalizeRecording(samplesRef.current);
  };

  const calibrate = () => {
    const known = parseFloat(calibKnown);
    if (!known || !distance) return;
    setFocalScale((s) => s * (known / distance));
  };

  const userSeries: SeriesPoint[] = useMemo(() => {
    if (!samples.length) return [];
    return buildUserSeriesForSamples(samples);
  }, [buildUserSeriesForSamples, samples]);

  const targetSeries = useMemo(() => sampleTarget(target, 300), [target]);

  const alignedUserSeries = useMemo(() => {
    if (!userSeries.length) return [];
    return targetSeries.map((point) => {
      const index = userSeries.findIndex((entry) => entry.t >= point.t);
      if (index <= 0) return { t: point.t, y: userSeries[0]?.y ?? 0 };
      if (index >= userSeries.length)
        return { t: point.t, y: userSeries[userSeries.length - 1]?.y ?? 0 };
      const current = userSeries[index]!;
      const previous = userSeries[index - 1]!;
      const span = current.t - previous.t;
      if (span <= 0) return { t: point.t, y: current.y };
      const local = (point.t - previous.t) / span;
      return { t: point.t, y: previous.y + (current.y - previous.y) * local };
    });
  }, [targetSeries, userSeries]);

  const correlation = useMemo(
    () => pearsonCorrelation(targetSeries, alignedUserSeries),
    [alignedUserSeries, targetSeries],
  );
  const matchScore = useMemo(() => {
    if (!targetSeries.length || !alignedUserSeries.length) return null;
    const diffs = targetSeries.map((point, index) => {
      const userPoint = alignedUserSeries[index];
      if (!userPoint) return null;
      return Math.abs(point.y - userPoint.y);
    });
    const validDiffs = diffs.filter((value): value is number => value !== null);
    if (!validDiffs.length) return null;
    const meanDifference = validDiffs.reduce((sum, value) => sum + value, 0) / validDiffs.length;
    const maxDifference = Math.max(...validDiffs);
    if (!Number.isFinite(meanDifference) || !Number.isFinite(maxDifference) || maxDifference <= 0)
      return null;
    const normalized = 1 - meanDifference / maxDifference;
    const clamped = Math.max(0, Math.min(5, normalized * 5));
    return Math.round(clamped * 100) / 100;
  }, [alignedUserSeries, targetSeries]);

  const graphBounds = useMemo(() => {
    const values = [...targetSeries, ...userSeries].map((p) => p.y);
    if (!values.length) {
      return { yMin: target.yMin, yMax: target.yMax };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(0.1, max - min);
    const pad = span * 0.15;
    return { yMin: min - pad, yMax: max + pad };
  }, [targetSeries, userSeries, target.yMin, target.yMax]);

  const yLabel =
    target.mode === "position"
      ? "distance (m)"
      : target.mode === "velocity"
        ? `${trackingMode === "face" ? "Face" : "Target"} tracker ready`
        : `Loading ${trackingMode === "face" ? "face" : "target"} tracker...`;

  const regionPoints = useMemo(() => {
    if (!region) return [];
    return userSeries.filter((p) => p.t >= region.t0 && p.t <= region.t1);
  }, [region, userSeries]);

  const fitRegion = () => {
    setRegionLinear(linearRegression(regionPoints));
    setRegionQuad(quadraticRegression(regionPoints));
  };

  const fitAll = () => {
    const series = buildUserSeriesForSamples(
      samplesRef.current.length ? samplesRef.current : samples,
    );
    setGlobalLinear(linearRegression(series));
    setGlobalQuad(quadraticRegression(series));
  };

  const downloadCsv = () => {
    const rows = ["time_s,distance_m"];
    for (const s of samplesRef.current.length ? samplesRef.current : samples) {
      rows.push(`${s.t.toFixed(4)},${s.d.toFixed(4)}`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = url;
    a.download = `kinematics-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const newTarget = useCallback(() => {
    saveCurrentTrial();
    resetActiveTrial();
    setTarget(generateTarget(mode, difficulty));
  }, [difficulty, mode, resetActiveTrial, saveCurrentTrial]);

  const switchTarget = useCallback(
    (nextMode: MotionMode, nextDifficulty: Difficulty) => {
      if (mode === nextMode && difficulty === nextDifficulty) return;
      saveCurrentTrial();
      resetActiveTrial();
      setMode(nextMode);
      setDifficulty(nextDifficulty);
      setTarget(generateTarget(nextMode, nextDifficulty));
    },
    [difficulty, mode, resetActiveTrial, saveCurrentTrial],
  );

  const renderCameraPanel = () => (
    <Card title="Camera">
      <label className="block text-xs text-slate-400">Tracking source</label>
      <select
        value={trackingMode}
        onChange={(e) => void changeTrackingMode(e.target.value as "face" | "target")}
        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
      >
        <option value="face">Face tracking</option>
        <option value="target">Image target tracking</option>
      </select>
      <div
        className="relative mx-auto flex max-w-[280px] touch-none justify-center overflow-hidden rounded-md bg-black"
        onPointerDown={trackingMode === "target" && cameraOn ? handleCropPointerDown : undefined}
        onPointerMove={trackingMode === "target" && cameraOn ? handleCropPointerMove : undefined}
        onPointerUp={trackingMode === "target" && cameraOn ? handleCropPointerUp : undefined}
      >
        <video
          ref={videoRef}
          className="aspect-video w-full max-w-[280px]"
          playsInline
          muted
          style={{ transform: "scaleX(-1)" }}
        />
        {trackingMode === "target" && cameraOn && cropSelection && (
          <div
            className="pointer-events-none absolute border-2 border-sky-400 bg-sky-400/20"
            style={{
              left: cropSelection.left,
              top: cropSelection.top,
              width: cropSelection.width,
              height: cropSelection.height,
            }}
          />
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-slate-400">Distance</span>
        <span className="font-mono text-sky-400">
          {distance ? `${distance.toFixed(2)} m` : "—"}
        </span>
      </div>
      {trackingMode === "target" && (
        <div className="mt-3 space-y-2">
          <input
            ref={targetFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void setUploadedTarget(file);
            }}
          />
          <div className="flex gap-2">
            <Button
              onClick={() => targetFileRef.current?.click()}
              variant="secondary"
              className="flex-1"
            >
              Upload target
            </Button>
            <Button
              onClick={() =>
                setTargetError("Drag a rectangle over the camera preview to select the target.")
              }
              variant="secondary"
              disabled={!cameraOn}
              className="flex-1"
            >
              Select region
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            {targetSet
              ? targetDetected
                ? "Target detected"
                : "Target loaded; show it to the camera"
              : "Upload an item image or crop the center of the feed"}
          </p>
          {targetError && <p className="text-[11px] text-rose-400">{targetError}</p>}
        </div>
      )}
      {activeView === "instructions" && !cameraOn ? (
        <Button onClick={startCamera} className="mt-3 w-full">
          Start camera
        </Button>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          {cameraOn
            ? modelReady
              ? `${trackingMode === "face" ? "Face" : "Target"} tracker ready`
              : `Loading ${trackingMode === "face" ? "face" : "target"} tracker...`
            : "Camera not active"}
        </p>
      )}
    </Card>
  );

  const renderInstructionsView = () => (
    <div className="space-y-4">
      <Card title="Instructions">
        <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-400">
          <li>Allow webcam access.</li>
          <li>
            {trackingMode === "face"
              ? "Stand ~1 m from the camera and calibrate."
              : "Load a target, enter its real width, then calibrate."}
          </li>
          <li>Pick a target graph and difficulty.</li>
          <li>
            Press <b>Start recording</b> and move to match the amber curve.
          </li>
          <li>Use region select + regression to analyze motion.</li>
        </ol>
      </Card>

      <Card title="Calibration">
        <label className="block text-xs text-slate-400">
          {trackingMode === "face" ? "Interpupillary distance (mm)" : "Target width (mm)"}
        </label>
        <input
          type="number"
          value={ipdMm}
          onChange={(e) =>
            setIpdMm(
              parseFloat(e.target.value) ||
                (trackingMode === "face" ? DEFAULT_IPD_MM : DEFAULT_TARGET_WIDTH_MM),
            )
          }
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
        />
        <label className="mt-3 block text-xs text-slate-400">
          Stand at known distance (m), then refine:
        </label>
        <div className="mt-1 flex gap-2">
          <input
            type="number"
            step="0.05"
            value={calibKnown}
            onChange={(e) => setCalibKnown(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
          />
          <Button onClick={calibrate} variant="secondary">
            Set
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Focal scale: {focalScale.toFixed(3)}</p>
      </Card>
    </div>
  );

  const renderSettingsView = () => (
    <div className="space-y-4">
      <Card title="Target graph">
        <label className="block text-xs text-slate-400">Motion mode</label>
        <select
          value={mode}
          onChange={(e) => switchTarget(e.target.value as MotionMode, difficulty)}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
        >
          <option value="position">Position vs time</option>
          <option value="velocity">Velocity vs time</option>
          <option value="acceleration">Acceleration vs time</option>
        </select>
        <label className="mt-3 block text-xs text-slate-400">Difficulty</label>
        <select
          value={difficulty}
          onChange={(e) => switchTarget(mode, e.target.value as Difficulty)}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <Button onClick={newTarget} className="mt-3 w-full">
          Generate new target
        </Button>
      </Card>

      <Card title="Align trace">
        <Slider
          label="Time offset (s)"
          value={timeOffset}
          min={-5}
          max={5}
          step={0.05}
          onChange={setTimeOffset}
        />
        <Slider
          label="Distance offset (m)"
          value={distOffset}
          min={-2}
          max={2}
          step={0.01}
          onChange={setDistOffset}
        />
        <Slider
          label="Distance scale"
          value={distScale}
          min={0.5}
          max={2}
          step={0.01}
          onChange={setDistScale}
        />
      </Card>

      <Card title="Data and export">
        <Button
          onClick={downloadCsv}
          variant="secondary"
          className="w-full"
          disabled={!samples.length}
        >
          Download CSV
        </Button>
        <p className="mt-2 text-xs text-slate-400">
          Samples captured: <span className="font-mono">{samplesRef.current.length}</span>
        </p>
      </Card>

      <Card title="Regression">
        <p className="text-xs text-slate-400">
          Shift-drag (or right-drag) the graph to select a region.
        </p>
        {region && (
          <p className="mt-1 font-mono text-[11px] text-slate-500">
            region: [{region.t0.toFixed(2)}, {region.t1.toFixed(2)}] s · {regionPoints.length} pts
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <Button
            onClick={fitRegion}
            disabled={!region || regionPoints.length < 3}
            variant="secondary"
          >
            Fit region
          </Button>
          <Button onClick={fitAll} disabled={userSeries.length < 3} variant="secondary">
            Fit all data
          </Button>
        </div>
        <div className="mt-3 space-y-2 text-xs">
          {regionLinear && (
            <FitRow
              color="#a3e635"
              title="Region linear"
              fit={regionLinear.formula}
              r2={regionLinear.r2}
            />
          )}
          {regionQuad && (
            <FitRow
              color="#f472b6"
              title="Region quadratic"
              fit={regionQuad.formula}
              r2={regionQuad.r2}
            />
          )}
          {globalLinear && (
            <FitRow
              color="#22d3ee"
              title="Global linear"
              fit={globalLinear.formula}
              r2={globalLinear.r2}
            />
          )}
          {globalQuad && (
            <FitRow
              color="#c084fc"
              title="Global quadratic"
              fit={globalQuad.formula}
              r2={globalQuad.r2}
            />
          )}
        </div>
      </Card>
    </div>
  );

  const renderGraphView = () => (
    <div className="space-y-4">
      <section
        ref={graphViewRef}
        className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <span className="text-slate-400">Target: </span>
            <span className="font-medium">{target.name}</span>
            <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-400">
              {target.mode} · {target.difficulty}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={recording ? stopRecording : startRecording}
              variant={recording ? "danger" : "secondary"}
              disabled={!cameraOn || (trackingMode === "target" && !targetSet)}
            >
              {recording ? "Stop recording" : "Start recording"}
            </Button>
            <Button onClick={toggleGraphFullscreen} variant="secondary">
              {isGraphFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </Button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-4 text-xs">
          <Legend color="#f59e0b" label="target" />
          <Legend color="#38bdf8" label="you" />
          {regionLinear && <Legend color="#a3e635" label="region linear" />}
          {regionQuad && <Legend color="#f472b6" label="region quad" />}
          {globalLinear && <Legend color="#22d3ee" label="global linear" />}
          {globalQuad && <Legend color="#c084fc" label="global quad" />}
        </div>
        <div className="h-[70vh] min-h-[540px]">
          <Graph
            target={targetSeries}
            user={userSeries}
            xMin={0}
            xMax={target.duration}
            yMin={graphBounds.yMin}
            yMax={graphBounds.yMax}
            xLabel="time (s)"
            yLabel={yLabel}
            selectedRegion={region}
            onSelectRegion={setRegion}
            linearFit={regionLinear}
            quadraticFit={regionQuad}
            globalLinearFit={globalLinear}
            globalQuadraticFit={globalQuad}
          />
        </div>
      </section>

      <Card title="Match quality">
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            <span className="text-slate-400">Pearson r:</span>{" "}
            {correlation === null ? "—" : correlation.toFixed(3)}
          </p>
          <p>
            <span className="text-slate-400">Score:</span>{" "}
            {matchScore === null ? "—" : `${matchScore}/5`}
          </p>
          <p className="text-xs text-slate-400">
            Stored trials: <span className="font-mono">{trialHistory.length}</span>
          </p>
        </div>
      </Card>

      <Card title="Current target">
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            <span className="text-slate-400">Name:</span> {target.name}
          </p>
          <p>
            <span className="text-slate-400">Mode:</span> {target.mode}
          </p>
          <p>
            <span className="text-slate-400">Difficulty:</span> {target.difficulty}
          </p>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Movement Matcher</h1>
            <p className="text-xs text-slate-400">
              Move toward and away from your webcam to match the target graph. All processing runs
              locally in your browser.
            </p>
          </div>
          <div className="relative">
            <button
              aria-label="Open view menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-md border border-slate-700 bg-slate-900/80 p-2 text-slate-200"
            >
              <div className="flex flex-col gap-1">
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
              </div>
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-2 min-w-[260px] rounded-lg border border-slate-700 bg-slate-900/95 p-2 shadow-xl">
                <button
                  onClick={() => {
                    setActiveView("instructions");
                    setMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${activeView === "instructions" ? "bg-slate-800 text-slate-100" : "text-slate-300 hover:bg-slate-800/70"}`}
                >
                  <span>Camera Setup 📸</span>
                </button>
                <button
                  onClick={() => {
                    setActiveView("settings");
                    setMenuOpen(false);
                  }}
                  className={`mt-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${activeView === "settings" ? "bg-slate-800 text-slate-100" : "text-slate-300 hover:bg-slate-800/70"}`}
                >
                  <span>Graph Settings and Data 🎯</span>
                </button>
                <button
                  onClick={() => {
                    setActiveView("graph");
                    setMenuOpen(false);
                  }}
                  className={`mt-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${activeView === "graph" ? "bg-slate-800 text-slate-100" : "text-slate-300 hover:bg-slate-800/70"}`}
                >
                  <span>Motion Graph 📈</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="p-4">
        <div className="mb-4">{renderCameraPanel()}</div>
        {activeView === "instructions" && renderInstructionsView()}
        {activeView === "settings" && renderSettingsView()}
        {activeView === "graph" && renderGraphView()}
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const base =
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const styles = {
    primary: "bg-sky-500 text-slate-950 hover:bg-sky-400",
    secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700",
    danger: "bg-rose-500 text-white hover:bg-rose-400",
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-sky-500"
      />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-slate-400">
      <span className="inline-block h-2 w-4 rounded" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function FitRow({
  color,
  title,
  fit,
  r2,
}: {
  color: string;
  title: string;
  fit: string;
  r2: number;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-3 rounded" style={{ backgroundColor: color }} />
        <span className="text-slate-300">{title}</span>
        <span className="ml-auto font-mono text-slate-500">R²={r2.toFixed(3)}</span>
      </div>
      <div className="mt-1 font-mono text-[11px] text-slate-200">{fit}</div>
    </div>
  );
}

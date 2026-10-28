import React, { useState, useRef, useEffect } from 'react';
import ToolFAQ from './components/ToolFAQ';

import BrandedNav from './components/BrandedNav';
import BrandedFooter from './components/BrandedFooter';
import { 
  Upload, Play, Pause, Volume2, VolumeX,
  Settings, Video, FileText, FileVideo, FileImage, Scissors,
  SkipBack, SkipForward, Repeat, Loader2, CheckCircle2, AlertCircle, AlertTriangle
} from 'lucide-react';
import { useToolUsage } from './hooks/useToolUsage';

export default function VideoToGif() {
  const { checkUsage, incrementUsage } = useToolUsage();

  const faqs = [
    {
      "question": "How does the Video to GIF converter work?",
      "answer": "It uses WebAssembly to extract a segment of your video and convert its frames into an optimized GIF animation directly in your browser."
    },
    {
      "question": "Why is my GIF file so large?",
      "answer": "GIF is an old, uncompressed format. To keep file sizes small, try reducing the resolution, lowering the frame rate (FPS), or trimming the video to a shorter duration."
    },
    {
      "question": "Are my videos uploaded to a server?",
      "answer": "No, all processing happens locally on your device. Your videos never leave your browser, ensuring complete privacy and saving bandwidth."
    },
    {
      "question": "Is there a limit on GIF length?",
      "answer": "While you can technically make long GIFs, we recommend keeping them under 10 seconds to ensure the file size remains manageable for web use."
    },
    {
      "question": "Is the Video to GIF tool free?",
      "answer": "Yes! You can convert clips into GIFs entirely for free without watermarks."
    }
  ];

  const [resolution, setResolution] = useState(480);
  const [fps, setFps] = useState(15);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(5);
  const [videoDuration, setVideoDuration] = useState(0);

  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  
  // Video state
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLooping, setIsLooping] = useState(true);

  // Gif state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState('Booting Engine...');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [resultVideoUrl, setResultVideoUrl] = useState(null);
  const [downloadFileName, setDownloadFileName] = useState("");

  const ffmpegRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const loadStarted = useRef(false);

  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;

    const loadFFmpeg = async () => {
      try {
        setLoadingMsg("Fetching Engine...");
        const { createFFmpeg } = window.FFmpeg;
        const ffmpeg = createFFmpeg({
           log: true,
           corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
        });
        ffmpegRef.current = ffmpeg;
        await ffmpeg.load();
        setIsReady(true);
        setLoadingMsg('Engine Loaded');
        setError(null);
      } catch (err) {
        console.error("FFmpeg load error:", err);
        setError("Error: " + (err.message || "Failed to initialize WebAssembly."));
        setLoadingMsg("Failed to Load");
      }
    };
    
    setTimeout(() => {
        if (window.FFmpeg) {
            loadFFmpeg();
        } else {
            setError("Global FFmpeg library failed to inject.");
        }
    }, 500);
  }, []);

  const getVideoDuration = (fileObj) => new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.src = URL.createObjectURL(fileObj);
  });

  const handleFile = async (selectedFile) => {
    if (selectedFile && selectedFile.type.startsWith('video/')) {
      setFile(selectedFile);
      const url = URL.createObjectURL(selectedFile);
      setVideoUrl(url);
      setError(null);
      
      const duration = await getVideoDuration(selectedFile);
      setVideoDuration(duration);
      setStartTime(0);
      setEndTime(Math.min(duration, 5));
    } else {
        setError('Please upload a valid video file.');
    }
  };

  // Handle file upload
  const handleFileChange = (e) => {
    handleFile(e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  // Video controls
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const p = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(p);
    }
  };

  const handleScrub = (e) => {
    if (videoRef.current) {
      const scrubTime = (e.target.value / 100) * videoRef.current.duration;
      videoRef.current.currentTime = scrubTime;
      setProgress(e.target.value);
    }
  };

  const stepFrame = (forward) => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
      videoRef.current.currentTime += forward ? 0.033 : -0.033;
    }
  };

  const handleProcess = async () => {
    if (!checkUsage()) {
      setError("Daily limit reached. Free users can process tools 3 times a day. Please upgrade for unlimited access.");
      return;
    }
    incrementUsage();

    if (!file || !isReady) return;

    if (startTime >= endTime || startTime < 0 || endTime > videoDuration) {
        setError('Invalid start or end time.');
        return;
    }

    if (file.size > 2000 * 1024 * 1024) {
      setError("File is too large for client-side processing. Please use a file under 2GB.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setResultVideoUrl(null);
    setProcessProgress(0);
    setDownloadFileName(file.name.split('.')[0]);

    try {
      const ffmpeg = ffmpegRef.current;
      const { fetchFile } = window.FFmpeg;
      
      setLoadingMsg('Uploading to virtual filesystem...');
      ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));

      setLoadingMsg('Generating GIF (this may take a minute)...');
      
      ffmpeg.setProgress(({ ratio }) => {
        if (ratio !== undefined && !isNaN(ratio)) {
          const percent = Math.min(Math.max(Math.round(ratio * 100), 0), 100);
          setProcessProgress(percent);
        }
      });
      
      const filters = `fps=${fps},scale=${resolution}:-1:flags=lanczos`;
      
      await ffmpeg.run(
        '-ss', String(startTime),
        '-to', String(endTime),
        '-i', 'input.mp4',
        '-vf', `${filters},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
        '-loop', '0',
        'output.gif'
      );

      setProcessProgress(100);
      setLoadingMsg("Finalizing...");

      const data = ffmpeg.FS('readFile', 'output.gif');
      const localVideoUrl = window.URL.createObjectURL(new Blob([data.buffer], { type: 'image/gif' }));
      
      setResultVideoUrl(localVideoUrl);
      
      const sizeMB = (data.buffer.byteLength / (1024 * 1024)).toFixed(2);
      
      setResult({ message: `Success! GIF generated (${sizeMB}MB)` });

      ffmpeg.setProgress(() => {});
      ffmpeg.FS('unlink', 'input.mp4');
      ffmpeg.FS('unlink', 'output.gif');

    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during GIF generation.');
    } finally {
      setIsProcessing(false);
      setProcessProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-6 md:p-12">
      
      <script type="application/ld+json">
        {JSON.stringify({'@context': 'https://schema.org', '@graph': [{'@type': 'SoftwareApplication', 'name': 'Videojin Video to GIF Converter', 'applicationCategory': 'MultimediaApplication', 'operatingSystem': 'All', 'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}}, {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': 'How does the Video to GIF converter work?', 'acceptedAnswer': {'@type': 'Answer', 'text': 'It uses WebAssembly to extract a segment of your video and convert its frames into an optimized GIF animation directly in your browser.'}}, {'@type': 'Question', 'name': 'Why is my GIF file so large?', 'acceptedAnswer': {'@type': 'Answer', 'text': 'GIF is an old, uncompressed format. To keep file sizes small, try reducing the resolution, lowering the frame rate (FPS), or trimming the video to a shorter duration.'}}, {'@type': 'Question', 'name': 'Are my videos uploaded to a server?', 'acceptedAnswer': {'@type': 'Answer', 'text': 'No, all processing happens locally on your device. Your videos never leave your browser, ensuring complete privacy and saving bandwidth.'}}]}, {'@type': 'HowTo', 'name': 'How to Create GIFs from Videos', 'step': [{'@type': 'HowToStep', 'name': 'Upload Video', 'text': 'Upload the video file you want to convert to a GIF.'}, {'@type': 'HowToStep', 'name': 'Trim & Configure', 'text': 'Select the exact start and end times, choose resolution, and pick a frame rate.'}, {'@type': 'HowToStep', 'name': 'Generate', 'text': 'Click Convert to GIF and our tool will generate a high-quality palette-mapped animation.'}, {'@type': 'HowToStep', 'name': 'Download', 'text': 'Download your brand new GIF instantly.'}]}]})}
      </script>
      <BrandedNav />
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter flex items-center gap-3">
              <FileImage className="text-pink-500" /> Video to GIF
            </h1>
            <p className="text-gray-400 font-medium">Create memes and previews directly in your browser.</p>
          </div>
          {videoUrl && !isProcessing && (
            <button 
              onClick={() => { setFile(null); setVideoUrl(null); setResult(null); setError(null); }}
              className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-full font-bold text-sm transition-colors border border-white/10"
            >
              Upload New Video
            </button>
          )}
        </div>

        {!videoUrl ? (
          <div 
            className="w-full max-w-3xl mx-auto h-[60vh] border-2 border-dashed border-white/10 rounded-[2rem] flex flex-col items-center justify-center p-8 text-center hover:bg-white/5 hover:border-pink-500/50 transition-all cursor-pointer group"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <input 
              type="file" 
              id="video-input" 
              accept="video/*" 
              className="hidden" 
              onChange={handleFileChange}
            />
            <label htmlFor="video-input" className="cursor-pointer flex flex-col items-center w-full h-full justify-center">
              <div className="w-20 h-20 bg-pink-500/10 text-pink-500 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Upload size={32} />
              </div>
              <h2 className="text-2xl font-black mb-2">Select a Video</h2>
              <p className="text-gray-400 max-w-sm">Drag and drop your .mp4 or .mov file here to convert it.</p>
              <div className="mt-8 px-4 py-2 bg-white/5 rounded-full text-xs font-bold text-gray-500 uppercase tracking-widest">
                Local Processing • Zero Uploads
              </div>
            </label>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main Preview Area */}
            <div className="flex-1 flex flex-col items-center">
              <div className="w-full bg-black rounded-3xl border border-white/10 shadow-2xl overflow-hidden shrink-0 aspect-video flex items-center justify-center">
                {resultVideoUrl ? (
                  <img 
                    src={resultVideoUrl}
                    alt="Generated GIF"
                    className="w-full h-full object-contain bg-zinc-900"
                  />
                ) : (
                  <video 
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full object-contain bg-zinc-900"
                    onTimeUpdate={handleTimeUpdate}
                    loop={isLooping}
                    muted={isMuted}
                    playsInline
                  />
                )}
              </div>

              {/* Transport Controls */}
              {!resultVideoUrl && (
                <div className="w-full mt-6 bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={() => stepFrame(false)} className="p-2 text-gray-400 hover:text-white"><SkipBack size={20} /></button>
                    <button onClick={togglePlay} className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform">
                      {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                    </button>
                    <button onClick={() => stepFrame(true)} className="p-2 text-gray-400 hover:text-white"><SkipForward size={20} /></button>
                  </div>
                  
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={progress}
                    onChange={handleScrub}
                    className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-pink-500"
                  />
                  
                  <div className="flex justify-between mt-4">
                    <button onClick={() => setIsMuted(!isMuted)} className={`p-2 rounded-lg ${isMuted ? 'text-red-400 bg-red-400/10' : 'text-gray-400 hover:text-white'}`}>
                      {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                    <button onClick={() => setIsLooping(!isLooping)} className={`p-2 rounded-lg ${isLooping ? 'text-pink-400 bg-pink-400/10' : 'text-gray-400 hover:text-white'}`}>
                      <Repeat size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Settings */}
            <div className="w-full lg:w-[350px] space-y-6">
              
              <div className="bg-pink-500/10 border border-pink-500/20 rounded-xl p-4 flex items-start gap-3">
                 <AlertTriangle className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
                 <div className="text-pink-200 text-xs">
                   <span className="font-bold text-pink-400">Pro Tip:</span> 
                   Keep GIFs short and reduce the framerate or resolution to avoid huge file sizes.
                </div>
              </div>

              {/* Settings */}
              {!result && !isProcessing && (
                <div className="glass-card p-6 rounded-3xl border border-white/10 bg-white/5 space-y-6">
                  
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                      <Settings size={16} /> Resolution
                    </h3>
                    <div className="flex justify-between text-xs font-mono text-gray-400 mb-2">
                      <span>Width: {resolution}px</span>
                    </div>
                    <input 
                      type="range" 
                      min="160" max="800" step="10" 
                      value={resolution} 
                      onChange={(e) => setResolution(e.target.value)} 
                      className="w-full accent-pink-500" 
                    />
                  </div>

                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                      <Settings size={16} /> Frame Rate
                    </h3>
                    <div className="flex justify-between text-xs font-mono text-gray-400 mb-2">
                      <span>{fps} FPS</span>
                    </div>
                    <input 
                      type="range" 
                      min="5" max="30" step="1" 
                      value={fps} 
                      onChange={(e) => setFps(e.target.value)} 
                      className="w-full accent-pink-500" 
                    />
                  </div>

                  <div>
                     <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                      <Scissors size={16} /> Trim Clip
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] uppercase text-gray-400 block mb-1">Start (s)</label>
                            <input 
                                type="number" 
                                min="0" max={videoDuration} step="0.1" 
                                value={startTime} 
                                onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
                                className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white font-mono text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase text-gray-400 block mb-1">End (s)</label>
                            <input 
                                type="number" 
                                min="0" max={videoDuration} step="0.1" 
                                value={endTime} 
                                onChange={(e) => setEndTime(parseFloat(e.target.value) || 0)}
                                className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-white font-mono text-sm"
                            />
                        </div>
                    </div>
                  </div>

                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-200 text-sm">{error}</p>
                </div>
              )}

              {result && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center">
                  <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-green-300 mb-4">{result.message}</p>
                  <div className="flex flex-col gap-3">
                    {resultVideoUrl && (
                      <a 
                        href={resultVideoUrl} 
                        download={`animated_${downloadFileName}.gif`}
                        className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-all text-sm"
                      >
                        <FileImage size={16} />
                        Download GIF
                      </a>
                    )}
                  </div>
                </div>
              )}

              {!result && (
                <button 
                  onClick={handleProcess}
                  disabled={isProcessing || !isReady}
                  className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl transition-all flex flex-col items-center justify-center gap-2 transform relative overflow-hidden ${
                    isProcessing || !isReady
                      ? 'bg-white/10 text-white/50 cursor-not-allowed'
                      : 'bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/20 hover:-translate-y-1'
                  }`}
                >
                  {isProcessing && (
                    <div 
                      className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300"
                      style={{ width: `${processProgress}%` }}
                    ></div>
                  )}
                  
                  <div className="relative flex items-center gap-2">
                    {(isProcessing || !isReady) ? <Loader2 size={18} className="animate-spin" /> : <FileImage size={18} />}
                    {isProcessing || !isReady ? loadingMsg : 'Generate GIF'}
                  </div>
                </button>
              )}

            </div>
          </div>
        )}
      </div>

      {/* SEO Sections */}
      <div className="mt-24 space-y-24 max-w-4xl mx-auto px-4">
        {/* How It Works */}
        <section>
          <h2 className="text-3xl font-bold mb-8 text-center">How to Convert Videos to GIFs</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-pink-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-pink-500/20">1</div>
              <h3 className="text-xl font-bold mb-3 text-pink-400 mt-2">Upload Video</h3>
              <p className="text-gray-400">Select the video clip you want to turn into an animated GIF.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-pink-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-pink-500/20">2</div>
              <h3 className="text-xl font-bold mb-3 text-pink-400 mt-2">Trim & Configure</h3>
              <p className="text-gray-400">Set the start and end times, and customize the resolution and frame rate.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-pink-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-pink-500/20">3</div>
              <h3 className="text-xl font-bold mb-3 text-pink-400 mt-2">Generate</h3>
              <p className="text-gray-400">Click Generate GIF and let our engine map out a high-quality color palette automatically.</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 bg-pink-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-pink-500/20">4</div>
              <h3 className="text-xl font-bold mb-3 text-pink-400 mt-2">Download</h3>
              <p className="text-gray-400">Save the final GIF directly to your device.</p>
            </div>
          </div>
        </section>

        {/* Feature Breakdown */}
        <section>
          <h2 className="text-3xl font-bold mb-8 text-center">Why Use Our Video to GIF Tool?</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">High-Quality Palette Mapping</h3>
              <p className="text-gray-400">We use a two-pass encoding process that first analyzes your video's colors to ensure the resulting GIF looks fantastic without severe banding.</p>
            </div>
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">Complete Control</h3>
              <p className="text-gray-400">Adjust the framerate and resolution with easy sliders to find the perfect balance between visual quality and file size.</p>
            </div>
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">100% Local Processing</h3>
              <p className="text-gray-400">Everything happens securely in your browser. Your video files are never uploaded to our servers.</p>
            </div>
            <div className="bg-[#0f172a] rounded-2xl p-8 border border-white/5">
              <h3 className="text-2xl font-bold mb-4">Completely Free</h3>
              <p className="text-gray-400">Create as many memes and reaction GIFs as you want, completely free and without any watermarks.</p>
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section>
          <h2 className="text-3xl font-bold mb-8 text-center">Built for Content Creators & Professionals</h2>
          <div className="space-y-6">
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row gap-6 items-center">
              <div className="md:w-1/3">
                <h3 className="text-xl font-bold mb-2">Community Managers</h3>
              </div>
              <div className="md:w-2/3">
                <p className="text-gray-400">Convert highlight moments from streams or videos into custom reaction GIFs for Discord and Twitter.</p>
              </div>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row gap-6 items-center">
              <div className="md:w-1/3">
                <h3 className="text-xl font-bold mb-2">Email Marketers</h3>
              </div>
              <div className="md:w-2/3">
                <p className="text-gray-400">Since you can't embed videos in emails reliably, turn short product teasers into looping GIFs that play inline.</p>
              </div>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col md:flex-row gap-6 items-center">
              <div className="md:w-1/3">
                <h3 className="text-xl font-bold mb-2">Bloggers & Writers</h3>
              </div>
              <div className="md:w-2/3">
                <p className="text-gray-400">Demonstrate software features or short steps visually without requiring readers to hit a play button.</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ToolFAQ faqs={faqs} />
      <BrandedFooter />
    </div>
  );
}

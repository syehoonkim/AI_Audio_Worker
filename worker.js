const fs = require("fs");
const path = require("path");

const { spawn, execFileSync } = require("child_process");

const MAX_JOB = 5;

const server = "10.110.61.61";
const hostURL = `http://${server}:50000`;

const jobList = [];

const ffmpegBin = "c:\\ffmpeg.exe";

const getJob = async () => {
  // try {
  const fetchedJob = await fetch(hostURL + "/job/claim", { method: "GET" });
  const body = await fetchedJob.json();
  if (!body) {
    console.log("No job to do...waiting for 1 mins");
    setTimeout(getJob, 1 * 60 * 1000);
    return;
  }

  jobList.push(body);
  const { index, src, dst, title, episode, video_duration } = body;

  const p = path.parse(dst);

  let ffmpegArgs;
  const ext = path.extname(dst);

  if (ext == ".mp3") {
    ffmpegArgs = [
      "-y",
      "-hide_banner",
      "-i",
      src,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      dst,
    ];
  } else if (ext == ".m4a") {
    ffmpegArgs = [
      "-y",
      "-hide_banner",
      "-i",
      src,
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      dst,
    ];
  }

  console.log(ext);
  console.log(ffmpegArgs);

  const ffmpegProc = spawn(ffmpegBin, ffmpegArgs);
  ffmpegProc.stdout.on("data", (msg) => console.log(msg.toString()));
  ffmpegProc.stderr.on("data", (msg) => console.log(msg.toString()));
  ffmpegProc.on("close", async (code) => {
    jobList.forEach((job, i) => {
      if (
        job.index == index &&
        job.src == src &&
        job.title == title &&
        job.episode == episode &&
        job.video_duration == video_duration
      ) {
        jobList.splice(i, 1);
      }
    });

    if (code == 0) {
      console.log(`Job:${JSON.stringify(body)} finished`);

      const tracks = JSON.parse(
        execFileSync("mediainfo", ["--Output=JSON", dst]).toString()
      ).media?.track;
      let resultAudioDuration = 0;
      tracks.forEach((track) => {
        if (track["@type"] == "Audio") {
          resultAudioDuration = track["Duration"];
          const n = Number(resultAudioDuration);
          resultAudioDuration = Number.isFinite(n) ? n : 0;
        }
      });

      await fetch(hostURL + "/job/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          succeeded: true,
          result_audio_duration: resultAudioDuration,
        }),
      });
    } else {
      console.log(`Something went wrong on Job:${JSON.stringify(body)}`);

      await fetch(hostURL + "/job/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          succeeded: false,
          result_audio_duration: 0,
        }),
      });
    }

    getJob();
  });
  // } catch (e) {
  //   console.log(`${e}`);
  // }
};

for (let i = 0; i < MAX_JOB; i++) {
  getJob();
}

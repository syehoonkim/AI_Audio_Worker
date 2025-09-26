const fs = require("fs");
const path = require("path");

const { spawn, execFileSync } = require("child_process");

const MAX_JOB = 5;

const hostURL = "http://127.0.0.1:50000";

const jobList = [];

const getJob = async () => {
  try {
    const fetchedJob = await fetch(hostURL, { method: "GET" });
    const body = await fetchedJob.json();
    if (!body) {
      console.log("No job to do...waiting for 1 mins");
      setTimeout(getJob, 1 * 60 * 1000);
      return;
    }

    jobList.push(body);
    const { index, src, dst, title, episode, video_duration } = body;

    const p = path.parse(dst);
    const dstPath = path.join(p.dir, `${p.name}.mp3`);

    const ffmpegArgs = [
      "-hide_banner",
      "-i",
      src,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      dstPath,
    ];
    const ffmpegProc = spawn("ffmpeg", ffmpegArgs);
    ffmpegProc.stdout.on("data", (msg) => console.log(msg.toString()));
    ffmpegProc.stderr.on("data", (msg) => console.log(msg.toString()));
    ffmpegProc.on("close", (code) => {
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
          execFileSync("mediainfo", ["--Output=JSON", dstPath]).toString()
        ).media?.track;
        let resultAudioDuration = 0;
        tracks.forEach((track) => {
          if (track["@type"] == "Audio") {
            resultAudioDuration = track["Duration"];
          }
        });

        console.log(
          JSON.stringify({
            ...body,
            succeeded: true,
            result_audio_duration: resultAudioDuration,
          })
        );
        fetch(hostURL, {
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

        fetch(hostURL, {
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
  } catch (e) {
    console.log(`${e}`);
  }
};

for (let i = 0; i < MAX_JOB; i++) {
  getJob();
}

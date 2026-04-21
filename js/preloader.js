import gsap from "gsap";

// initialization
document.addEventListener("DOMContentLoaded", init);

function init() {
  const hasSeenPreloader = sessionStorage.getItem("preloaderSeen") === "true";
  const preloader = document.querySelector(".preloader");

  if (!preloader) return;

  if (hasSeenPreloader) {
    preloader.style.display = "none";
    return;
  }

  startSequence();
}

// progress bar sequence with random increments
function startSequence() {
  const progressIndicator = document.querySelector(".progress-bar-indicator");
  const progressText = document.querySelector(".progress-bar-copy span");
  const progressBar = document.querySelector(".progress-bar");

  if (!progressIndicator || !progressText || !progressBar) return;

  gsap.to(progressBar, {
    opacity: 1,
    duration: 0.075,
    ease: "power2.inOut",
    delay: 0.5,
    repeat: 1,
    yoyo: true,
    onComplete: () => {
      gsap.set(progressBar, { opacity: 1 });
      startIncrements();
    },
  });

  function startIncrements() {
    let currentProgress = 0;
    const totalSteps = 5;
    let stepCount = 0;
    const increments = generateRandomIncrements(totalSteps);

    function animateNextStep() {
      if (stepCount >= totalSteps) {
        complete();
        return;
      }

      const increment = increments[stepCount];
      const targetProgress = Math.min(currentProgress + increment, 100);
      const randomDelay = 200 + Math.random() * 400;

      setTimeout(() => {
        gsap.to(progressIndicator, {
          "--progress": targetProgress / 100,
          duration: 0.5,
          ease: "power2.out",
          onUpdate: () => {
            const currentValue = Math.round(
              gsap.getProperty(progressIndicator, "--progress") * 100,
            );
            progressText.textContent = `${currentValue}%`;
          },
          onComplete: () => {
            currentProgress = targetProgress;
            stepCount++;
            animateNextStep();
          },
        });
      }, randomDelay);
    }

    animateNextStep();
  }
}

// generate random increments that sum to 100
function generateRandomIncrements(totalSteps) {
  const increments = [];
  let remaining = 100;
  const maxSingleIncrement = 30;

  for (let i = 0; i < totalSteps - 1; i++) {
    const maxIncrement = Math.min(
      maxSingleIncrement,
      remaining - (totalSteps - 1 - i),
    );
    const minIncrement = Math.max(
      5,
      Math.floor((remaining / (totalSteps - i)) * 0.5),
    );
    const increment =
      Math.floor(Math.random() * (maxIncrement - minIncrement)) + minIncrement;
    increments.push(increment);
    remaining -= increment;
  }

  increments.push(remaining);
  return increments.sort(() => Math.random() - 0.5);
}

// complete and remove preloader with flicker animations
function complete() {
  const preloader = document.querySelector(".preloader");
  const progressBar = document.querySelector(".progress-bar");
  const preloaderBlocks = document.querySelectorAll(".preloader-block");

  if (!preloader) return;

  sessionStorage.setItem("preloaderSeen", "true");

  gsap.to(progressBar, {
    opacity: 0,
    duration: 0.075,
    ease: "power2.inOut",
    delay: 0.3,
    repeat: 1,
    yoyo: true,
    onComplete: () => {
      gsap.set(progressBar, { opacity: 0 });

      setTimeout(() => {
        const shuffledBlocks = [...preloaderBlocks].sort(
          () => Math.random() - 0.5,
        );

        shuffledBlocks.forEach((block, index) => {
          gsap.to(block, {
            opacity: 0,
            duration: 0.075,
            ease: "power2.inOut",
            delay: index * 0.025,
            repeat: 1,
            yoyo: true,
            onComplete: () => {
              gsap.set(block, { opacity: 0 });
              if (index === shuffledBlocks.length - 1) {
                preloader.style.display = "none";
              }
            },
          });
        });
      }, 200);
    },
  });
}

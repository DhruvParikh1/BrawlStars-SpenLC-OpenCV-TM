// utils/opencv.ts
declare global {
  interface Window {
    cv: any;
  }
}

export const waitForOpenCV = () => {
  return new Promise<void>((resolve) => {
    if (window.cv && window.cv.imread) {
      resolve();
    } else {
      // Poll for OpenCV to be loaded
      const interval = setInterval(() => {
        if (window.cv && window.cv.imread) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    }
  });
};
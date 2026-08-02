/*
 * captureStream() on media elements is still not in TypeScript's DOM lib
 * (it lives in the W3C Media Capture from DOM Elements spec). Firefox only
 * ships the prefixed form. Declared here so BroadcastView can use both
 * without `any`.
 */
interface HTMLMediaElement {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
}

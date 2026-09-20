/** Vite bundles imported workers as local renderer resources. */
declare module "*?worker" {
  const WorkerConstructor: { new (): Worker };
  export default WorkerConstructor;
}

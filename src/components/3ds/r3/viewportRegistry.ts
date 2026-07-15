import type { WebGLRenderer, Scene, Camera } from 'three';

/**
 * Registry that lets non-r3f code (Quick Render dialog) access the perspective
 * viewport's three.js primitives so it can perform a proper offline render.
 */
export interface ViewportHandle {
  gl: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  controls?: any;
}

const handles = new Map<string, ViewportHandle>();

export const registerViewport = (key: string, handle: ViewportHandle) => {
  handles.set(key, handle);
};

export const unregisterViewport = (key: string) => {
  handles.delete(key);
};

export const getViewportHandle = (key: string = 'perspective'): ViewportHandle | undefined => {
  return handles.get(key) ?? handles.values().next().value;
};

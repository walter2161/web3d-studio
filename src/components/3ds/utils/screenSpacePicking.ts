import * as THREE from 'three';

type RendererLike = Pick<THREE.WebGLRenderer, 'getSize'>;

const size = new THREE.Vector2();
const worldPoint = new THREE.Vector3();

function pixelDistanceToRay(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  renderer: RendererLike,
  point: THREE.Vector3,
) {
  renderer.getSize(size);
  const projected = point.clone().project(camera);
  if (projected.z < -1 || projected.z > 1) return Infinity;

  const distanceToRay = raycaster.ray.distanceToPoint(point);
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const perspective = camera as THREE.PerspectiveCamera;
    const depth = perspective.position.distanceTo(point);
    if (depth <= 0) return Infinity;
    const fov = THREE.MathUtils.degToRad(perspective.fov);
    const worldHeight = 2 * Math.tan(fov / 2) * depth;
    return distanceToRay * (size.y / Math.max(worldHeight, 1e-6));
  }

  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const ortho = camera as THREE.OrthographicCamera;
    const worldHeight = (ortho.top - ortho.bottom) / Math.max(ortho.zoom, 1e-6);
    return distanceToRay * (size.y / Math.max(worldHeight, 1e-6));
  }

  return distanceToRay;
}

function cameraFor(raycaster: THREE.Raycaster, fallback: THREE.Camera) {
  return ((raycaster as any).camera as THREE.Camera | null | undefined) ?? fallback;
}

function pickDistance(pixelDistance: number, depth: number) {
  // Three/R3F sorts intersections by `distance`. Markers are viewport overlays,
  // so their screen-space proximity must win over normal mesh depth.
  return pixelDistance * 0.001 + depth * 1e-9;
}

export function makeScreenSpaceMeshRaycast(
  getCamera: () => THREE.Camera,
  getRenderer: () => RendererLike,
  pixelRadius: number,
) {
  return function screenSpaceMeshRaycast(this: THREE.Object3D, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
    const camera = cameraFor(raycaster, getCamera());
    this.getWorldPosition(worldPoint);
    const pixelDistance = pixelDistanceToRay(raycaster, camera, getRenderer(), worldPoint);
    if (pixelDistance > pixelRadius) return;
    const depth = raycaster.ray.origin.distanceTo(worldPoint);
    intersects.push({
      distance: pickDistance(pixelDistance, depth),
      point: worldPoint.clone(),
      object: this,
      face: null,
      faceIndex: undefined,
      uv: undefined,
    } as unknown as THREE.Intersection);
  };
}

export function makeScreenSpacePointsRaycast(
  getCamera: () => THREE.Camera,
  getRenderer: () => RendererLike,
  pixelRadius: number,
) {
  return function screenSpacePointsRaycast(this: THREE.Points, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!position) return;

    const camera = cameraFor(raycaster, getCamera());
    this.updateMatrixWorld();
    for (let i = 0; i < position.count; i += 1) {
      worldPoint.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(this.matrixWorld);
      const pixelDistance = pixelDistanceToRay(raycaster, camera, getRenderer(), worldPoint);
      if (pixelDistance > pixelRadius) continue;
      const depth = raycaster.ray.origin.distanceTo(worldPoint);
      intersects.push({
        distance: pickDistance(pixelDistance, depth),
        distanceToRay: pixelDistance,
        index: i,
        point: worldPoint.clone(),
        object: this,
        face: null,
        faceIndex: undefined,
        uv: undefined,
      } as unknown as THREE.Intersection);
    }
  };
}
import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';

export class AstraSceneViewer {
  constructor(host, status, cameraMenu) {
    this.host = host;
    this.status = status;
    this.cameraMenu = cameraMenu;
    this.generation = 0;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Rotatable and zoomable 3D scene. Press W A S D to move, R and F to move vertically, and Shift to move faster.',
    );
    host.append(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#263138');
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.02, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new THREE.Scene();
    const roomMaterial = new THREE.MeshStandardMaterial({ side: THREE.BackSide });
    const roomGeometry = new THREE.BoxGeometry(1, 1, 1);
    const roomMesh = new THREE.Mesh(roomGeometry, roomMaterial);
    roomMesh.scale.set(30, 25, 30);
    roomMesh.position.y = 10;
    room.add(roomMesh);
    const roomLight = new THREE.PointLight(0xffffff, 850, 28, 2);
    roomLight.position.set(0.5, 16, 0.3);
    room.add(roomLight);
    this.environment = this.pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    roomGeometry.dispose();
    roomMaterial.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667482, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(10, 20, 8);
    this.scene.add(sun);
    this.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
    this.cameraMenu.onchange = () => this.setCamera(this.cameraMenu.value);
    this.keys = new Set();
    this.renderer.domElement.addEventListener('pointerdown', () => {
      this.renderer.domElement.focus({ preventScroll: true });
    });
    this.renderer.domElement.addEventListener('keydown', (event) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        this.keys.add(event.code);
        event.preventDefault();
      }
    });
    this.renderer.domElement.addEventListener('keyup', (event) => this.keys.delete(event.code));
    this.renderer.domElement.addEventListener('blur', () => this.keys.clear());
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop((time) => {
      const deltaTime = Math.min((time - this.lastTime) / 1000, 0.05);
      this.lastTime = time;
      if (!this.active) return;
      if (this.model && this.keys.size) {
        const forward = this.camera.getWorldDirection(new THREE.Vector3());
        const right = forward.clone().cross(this.camera.up).normalize();
        const movement = new THREE.Vector3();
        const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
        const speed = this.radius * 0.18 * deltaTime * (fast ? 3 : 1);
        if (this.keys.has('KeyW')) movement.add(forward);
        if (this.keys.has('KeyS')) movement.sub(forward);
        if (this.keys.has('KeyD')) movement.add(right);
        if (this.keys.has('KeyA')) movement.sub(right);
        if (this.keys.has('KeyR')) movement.y += 1;
        if (this.keys.has('KeyF')) movement.y -= 1;
        movement.multiplyScalar(speed);
        this.camera.position.add(movement);
        this.controls.target.add(movement);
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
    this.setActive(true);
    this.resize();
  }

  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setActive(active) {
    this.active = active;
    if (active) this.resize();
    else this.keys.clear();
  }

  disposeModel(model) {
    if (!model) return;
    const materials = new Set();
    const textures = new Set();
    const geometries = new Set();
    model.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (material) materials.add(material);
      }
    });
    materials.forEach((material) => {
      Object.values(material).forEach((value) => { if (value?.isTexture) textures.add(value); });
      material.dispose();
    });
    textures.forEach((texture) => {
      texture.dispose();
      if (texture.image?.close) texture.image.close();
    });
    geometries.forEach((geometry) => geometry.dispose());
    this.scene.remove(model);
  }

  async load(url, metadata) {
    const generation = ++this.generation;
    this.abort?.abort();
    this.abort = new AbortController();
    this.disposeModel(this.model);
    this.model = null;
    this.host.dataset.state = 'loading';
    this.status.textContent = 'Loading 3D scene…';
    this.cameraMenu.replaceChildren();
    this.setActive(true);
    try {
      const response = await fetch(url, { signal: this.abort.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const length = Number(response.headers.get('content-length'));
      const reader = response.body.getReader();
      let received = 0;
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (generation === this.generation) {
          this.status.textContent = length
            ? `Loading 3D model ${Math.round(received / length * 100)}%`
            : `Loading 3D model ${(received / 1048576).toFixed(1)} MB`;
        }
      }
      if (generation !== this.generation) return;
      this.status.textContent = 'Parsing geometry and textures…';
      const data = new Uint8Array(received);
      let offset = 0;
      chunks.forEach((chunk) => { data.set(chunk, offset); offset += chunk.length; });
      const gltf = await new GLTFLoader().parseAsync(data.buffer, new URL('.', new URL(url, location.href)).href);
      if (generation !== this.generation) {
        this.disposeModel(gltf.scene);
        return;
      }
      this.model = gltf.scene;
      this.metadata = metadata || {};
      this.bounds = new THREE.Box3().setFromObject(this.model);
      this.center = this.bounds.getCenter(new THREE.Vector3());
      this.radius = Math.max(this.bounds.getSize(new THREE.Vector3()).length() / 2, 1);
      this.model.traverse((object) => {
        if (!object.isMesh) return;
        object.frustumCulled = true;
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
          material.side = THREE.DoubleSide;
          material.clippingPlanes = [];
          material.clipShadows = false;
        }
      });
      this.scene.add(this.model);
      this.camera.near = Math.max(0.005, this.radius / 10000);
      this.camera.far = Math.max(1000, this.radius * 30);
      this.camera.updateProjectionMatrix();
      this.controls.minDistance = this.radius * 0.001;
      this.controls.maxDistance = this.radius * 20;

      const option = (value, label) => {
        const node = document.createElement('option');
        node.value = value;
        node.textContent = label;
        return node;
      };
      this.cameraMenu.append(option('overview', 'Full scene overview'));
      (this.metadata.cameras || []).forEach((camera, index) => {
        this.cameraMenu.append(option(String(index), camera.name));
      });
      const defaultIndex = (this.metadata.cameras || []).findIndex((camera) => camera.default);
      this.defaultCamera = defaultIndex >= 0 ? String(defaultIndex) : 'overview';
      this.setCamera(this.defaultCamera);
      this.setSection(100);
      this.setWireframe(false);
      this.host.dataset.state = 'ready';
      const meshes = Number(this.metadata.export_mesh_objects || 0).toLocaleString();
      this.status.textContent = `Loaded · ${meshes} mesh objects · ${(received / 1048576).toFixed(1)} MB · Click the viewer, then use W/A/S/D to move, R/F to rise/lower, and Shift to move faster.`;
    } catch (error) {
      if (generation !== this.generation || error.name === 'AbortError') return;
      this.host.dataset.state = 'error';
      this.status.textContent = `3D loading failed: ${error.message}.`;
      throw error;
    }
  }

  cancel() {
    ++this.generation;
    this.abort?.abort();
    this.keys.clear();
    this.disposeModel(this.model);
    this.model = null;
    this.host.dataset.state = 'idle';
  }

  setCamera(value) {
    if (!this.model) return;
    this.cameraMenu.value = value;
    this.camera.up.set(0, 1, 0);
    if (value === 'overview') {
      this.camera.fov = 50;
      this.controls.target.copy(this.center);
      this.camera.position.copy(this.center).add(
        new THREE.Vector3(1, 0.8, 1.1).normalize().multiplyScalar(this.radius * 2.7),
      );
    } else {
      const camera = (this.metadata.cameras || [])[Number(value)];
      if (!camera) return;
      this.camera.position.fromArray(camera.position);
      this.camera.up.fromArray(camera.up).normalize();
      this.camera.fov = Math.max(20, Math.min(100, camera.fov));
      const distance = camera.type === 'ORTHO'
        ? camera.ortho_scale / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))
        : this.radius * 0.15;
      this.controls.target.copy(this.camera.position).add(
        new THREE.Vector3().fromArray(camera.forward).multiplyScalar(distance),
      );
    }
    this.camera.lookAt(this.controls.target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setSection(percent) {
    if (!this.model) return;
    this.clip.constant = THREE.MathUtils.lerp(this.bounds.min.y, this.bounds.max.y, percent / 100);
    this.model.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        material.clippingPlanes = percent >= 100 ? [] : [this.clip];
        material.needsUpdate = true;
      }
    });
  }

  setWireframe(enabled) {
    if (!this.model) return;
    this.model.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        material.wireframe = enabled;
      }
    });
  }

  dispose() {
    this.cancel();
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.controls.dispose();
    this.environment.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

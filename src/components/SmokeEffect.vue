<template>
  <div ref="container" class="smoke-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

const container = ref(null)

let renderer, scene, camera, smokeParticles, clock, animId

function createSmokeTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function init() {
  const el = container.value
  if (!el) return

  const w = el.clientWidth
  const h = el.clientHeight

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(50, w / h, 1, 1000)
  camera.position.z = 300
  camera.position.y = 50

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(window.devicePixelRatio)
  el.appendChild(renderer.domElement)

  const texture = createSmokeTexture()

  // Colors from design tokens: primary-fixed (#d6e6e5) and tertiary-fixed (#fadcd2)
  const colors = [
    new THREE.Color(0xd6e6e5),
    new THREE.Color(0xfadcd2),
    new THREE.Color(0xbacac9),
    new THREE.Color(0xddc0b7),
  ]

  smokeParticles = []

  for (let i = 0; i < 40; i++) {
    const color = colors[Math.floor(Math.random() * colors.length)]
    const material = new THREE.MeshLambertMaterial({
      color,
      map: texture,
      transparent: true,
      opacity: 0,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
    })

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), material)
    mesh.position.set(
      (Math.random() - 0.5) * 200,
      -80 + Math.random() * 40,
      (Math.random() - 0.5) * 80,
    )
    mesh.rotation.z = Math.random() * Math.PI * 2

    scene.add(mesh)

    smokeParticles.push({
      mesh,
      speed: 0.1 + Math.random() * 0.2,
      drift: (Math.random() - 0.5) * 0.2,
      rotSpeed: (Math.random() - 0.5) * 0.002,
      phase: Math.random() * Math.PI * 2,
      maxOpacity: 0.04 + Math.random() * 0.04,
    })
  }

  scene.fog = new THREE.FogExp2(0x131313, 0.004)

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  clock = new THREE.Clock()
}

function animate() {
  animId = requestAnimationFrame(animate)

  const elapsed = clock.getElapsedTime()

  for (const p of smokeParticles) {
    p.mesh.position.y += p.speed
    p.mesh.position.x += Math.sin(elapsed * 0.5 + p.phase) * p.drift
    p.mesh.rotation.z += p.rotSpeed

    // Fade in from bottom, fade out toward top
    const heightRatio = (p.mesh.position.y + 80) / 380
    if (heightRatio < 0.15) {
      p.mesh.material.opacity = p.maxOpacity * (heightRatio / 0.15)
    } else if (heightRatio > 0.7) {
      p.mesh.material.opacity = p.maxOpacity * (1 - (heightRatio - 0.7) / 0.3)
    } else {
      p.mesh.material.opacity = p.maxOpacity
    }

    // Reset when too high
    if (p.mesh.position.y > 300) {
      p.mesh.position.y = -80 + Math.random() * 20
      p.mesh.position.x = (Math.random() - 0.5) * 200
      p.mesh.material.opacity = 0
    }
  }

  renderer.render(scene, camera)
}

function onResize() {
  const el = container.value
  if (!el || !renderer) return
  const w = el.clientWidth
  const h = el.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

onMounted(() => {
  init()
  animate()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  cancelAnimationFrame(animId)
  if (renderer) {
    renderer.dispose()
    container.value?.removeChild(renderer.domElement)
  }
  if (smokeParticles) {
    for (const p of smokeParticles) {
      p.mesh.geometry.dispose()
      p.mesh.material.map?.dispose()
      p.mesh.material.dispose()
    }
  }
})
</script>

<style scoped>
.smoke-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}
</style>
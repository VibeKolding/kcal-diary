import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createLeafGeometry, createLeafShadowGeometry } from './leafGeometry'

/**
 * 3D-сцена эмблемы: кольцо с разрывом и лист из золотого стекла.
 *
 * Геометрия повторяет SVG-знак: кольцо r=40 толщиной 6 в поле 100×100,
 * разрыв вверху справа, лист по тому же пути и с теми же прорезями.
 */

const GOLD_1 = 0xF2D99B
const GOLD_2 = 0xC9952B

function glassMaterial(color: number, transmission: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.15,
    roughness: 0.14,
    transmission,
    thickness: 7,
    ior: 1.5,
    attenuationColor: new THREE.Color(GOLD_1),
    attenuationDistance: 26,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.4,
  })
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(242, 217, 155, 0.55)')
  g.addColorStop(0.35, 'rgba(226, 176, 74, 0.22)')
  g.addColorStop(0.7, 'rgba(226, 176, 74, 0.04)')
  g.addColorStop(1, 'rgba(226, 176, 74, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * dpr — плотность экрана. Кадр рисуется вдвое крупнее (но не больше шести
 * точек на пиксель) и сжимается браузером: это сглаживает не только края,
 * как встроенное сглаживание, но и блики. Тонкий блик по кромке листа при
 * встроенном сглаживании шёл пунктиром — оно усредняет только покрытие
 * треугольника, а не цвет внутри него.
 */
export function createEmblemScene(canvas: HTMLCanvasElement, cssSize: number, dpr = 1) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true })
  renderer.setPixelRatio(Math.min(dpr * 2, 6))
  // Стекло берёт то, что за ним, из отдельного кадра. Непрозрачных тел в
  // сцене нет, кадр однотонный, и его разрешение на картинку не влияет —
  // а в полном размере он занимал бы больше памяти, чем сам знак.
  renderer.transmissionResolutionScale = 0.25
  renderer.setSize(cssSize, cssSize, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const camera = new THREE.PerspectiveCamera(28, 1, 1, 1000)
  camera.position.set(0, 0, 230)

  // Свет: тёплый ключевой сверху слева, холодный контровой снизу справа
  const key = new THREE.PointLight(0xFFE7B0, 900, 0, 1.6)
  key.position.set(-90, 120, 140)
  const rim = new THREE.PointLight(0xBFD8FF, 350, 0, 1.6)
  rim.position.set(110, -80, 90)
  scene.add(key, rim, new THREE.AmbientLight(0xFFFFFF, 0.25))

  const root = new THREE.Group()
  scene.add(root)

  // --- Свечение за знаком ---
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(118, 118),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false }),
  )
  glow.position.z = -40
  root.add(glow)

  // --- Кольцо с разрывом: дуга 314°, разрыв по центру вверху справа (45°) ---
  const gapHalf = THREE.MathUtils.degToRad(23)
  const start = THREE.MathUtils.degToRad(45) + gapHalf
  const end = THREE.MathUtils.degToRad(45 + 360) - gapHalf
  class Arc extends THREE.Curve<THREE.Vector3> {
    constructor() { super() }
    override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
      const a = start + (end - start) * t
      return target.set(Math.cos(a) * 40, Math.sin(a) * 40, 0)
    }
  }
  const arc = new Arc()
  const SEGMENTS = 160
  const RADIAL = 24
  const ringGeo = new THREE.TubeGeometry(arc, SEGMENTS, 3.2, RADIAL, false)
  const ring = new THREE.Mesh(ringGeo, glassMaterial(GOLD_2, 0.82))
  // Индексов на один сегмент трубы: RADIAL квадов по два треугольника
  const PER_SEGMENT = RADIAL * 6
  // Скруглённые концы, как stroke-linecap: round
  const cap = new THREE.SphereGeometry(3.2, 20, 16)
  const capA = new THREE.Mesh(cap, ring.material)
  const capB = new THREE.Mesh(cap, ring.material)
  capA.position.copy(arc.getPoint(0))
  capB.position.copy(arc.getPoint(1))
  const ringGroup = new THREE.Group()
  ringGroup.add(ring, capA, capB)
  root.add(ringGroup)

  // --- Лист: тот же контур, что в SVG, со сквозными прорезями прожилок ---
  const leafGeo = createLeafGeometry()
  const leafMat = glassMaterial(GOLD_2, 0.45)
  leafMat.attenuationDistance = 12
  // Кромки прорезей видны почти по касательной, а под таким углом любое
  // стекло отражает окружение почти целиком — белым. Щель обводилась
  // серебряной чертой. Металл окрашивает отражение своим цветом, и кромка
  // остаётся золотой, только глубже лицевой грани — как срез толстого стекла.
  const cutMat = new THREE.MeshPhysicalMaterial({
    color: GOLD_2, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.1,
  })
  const leaf = new THREE.Mesh(leafGeo, [leafMat, cutMat])
  leaf.position.z = 6
  root.add(leaf)

  // Маска глубины по контуру листа: за прорезями — фон, а не свечение
  const shadowGeo = createLeafShadowGeometry()
  const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ colorWrite: false }))
  leaf.add(shadow)

  const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
  // Лёгкий перелёт в конце — лист «распускается», а не просто вырастает
  const easeBack = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2)

  /**
   * rx, ry — наклон в градусах; t — время (мс) для покоя; progress 0..1 —
   * появление: кольцо прорисовывается по дуге, лист распускается следом.
   * Хореография: появление → парение с бегущим светом → отклик на наклон.
   */
  function render(rx: number, ry: number, t = 0, progress = 1) {
    // --- появление ---
    const ringP = easeOut(Math.min(1, progress / 0.75))
    const segs = Math.max(1, Math.floor(ringP * SEGMENTS))
    ringGeo.setDrawRange(0, segs * PER_SEGMENT)
    capB.position.copy(arc.getPoint(segs / SEGMENTS))
    const leafP = progress < 0.35 ? 0 : Math.min(1, (progress - 0.35) / 0.65)
    const leafS = leafP === 0 ? 0.001 : easeBack(leafP)
    leaf.scale.setScalar(leafS)
    leaf.rotation.z = (1 - leafP) * -0.45
    leaf.visible = leafP > 0

    // --- покой: парение и медленный поворот ---
    const float = Math.sin(t * 0.0011) * 2.4
    root.position.y = float
    root.rotation.x = THREE.MathUtils.degToRad(rx) + Math.sin(t * 0.0007) * 0.04
    root.rotation.y = THREE.MathUtils.degToRad(ry) + Math.sin(t * 0.0005) * 0.1
    // Лист чуть опережает кольцо — параллакс внутри знака, и парит в своём ритме
    leaf.position.x = ry * 0.35
    leaf.position.y = -rx * 0.35 + Math.sin(t * 0.0011 + 1.2) * 1.2

    // --- бегущий свет: ключевой источник ходит по дуге над знаком,
    //     и блик едет по кольцу, как на стекле под лампой ---
    const a = t * 0.0006
    key.position.set(Math.cos(a) * 150 - 20, Math.sin(a) * 90 + 70, 140)
    rim.position.set(-Math.cos(a) * 120 + 30, -Math.sin(a) * 70 - 40, 90)

    renderer.render(scene, camera)
  }

  function dispose() {
    pmrem.dispose()
    renderer.dispose()
    leafGeo.dispose()
    shadowGeo.dispose()
    leafMat.dispose()
    cutMat.dispose()
    ringGeo.dispose()
    cap.dispose()
  }

  return { render, dispose, renderer }
}

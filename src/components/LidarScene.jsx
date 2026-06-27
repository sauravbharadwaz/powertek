import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { computeCloudColors } from "@/lib/pointcloud";

/* ── render-ready points for the active dataset + colour mode ── */
function CloudPoints({ dataset, mode, size }) {
  const colors = useMemo(() => computeCloudColors(dataset, mode), [dataset, mode]);
  return (
    <points key={`${dataset.id}-${mode}`}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[dataset.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={size} vertexColors sizeAttenuation transparent opacity={0.96} depthWrite={false} />
    </points>
  );
}

/* ── sweeping inspection plane ── */
function ScanPlane({ on, accent, span, height }) {
  const ref = useRef();
  const range = span * 1.1;
  useFrame((s) => {
    if (ref.current) ref.current.position.x = ((s.clock.elapsedTime * (span / 14)) % range) - range / 2;
  });
  if (!on) return null;
  return (
    <group ref={ref} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, height / 2, 0]}>
        <planeGeometry args={[span * 0.5, height]} />
        <meshBasicMaterial color={accent} transparent opacity={0.1} side={2} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, height / 2, 0]}>
        <planeGeometry args={[span * 0.5, height * 0.012 + 0.2]} />
        <meshBasicMaterial color={accent} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function LidarScene({
  dataset,
  mode = "elevation",
  scan = true,
  autoRotate = false,
  pointSize = 0.22,
  accent = "#22d3ee",
}) {
  if (!dataset || !dataset.sceneSize) return null;
  const [sx, sy, sz] = dataset.sceneSize;
  const span = Math.max(sx, sz, 1);
  const height = Math.max(sy, 1);
  const fit = Math.max(span, height) * 1.15;

  return (
    <Canvas
      key={dataset.id}
      dpr={[1, 2]}
      camera={{ position: [fit * 0.85, fit * 0.6, fit * 0.85], fov: 46, near: 0.1, far: fit * 12 + 400 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#070b11"]} />
      <fog attach="fog" args={["#070b11", fit * 1.6, fit * 5]} />
      <ambientLight intensity={0.8} />

      {/* ground slab */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <planeGeometry args={[span * 1.6, span * 1.6]} />
        <meshBasicMaterial color="#04070c" />
      </mesh>

      <CloudPoints dataset={dataset} mode={mode} size={pointSize} />
      <ScanPlane on={scan} accent={accent} span={span} height={height} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[0, height / 2, 0]}
        minDistance={Math.max(2, fit * 0.12)}
        maxDistance={fit * 8}
        maxPolarAngle={Math.PI / 2.02}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
      />
    </Canvas>
  );
}

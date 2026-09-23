// V3 pillar 3: an abstract consensus visual.
// Five validators read the same evidence and converge on one verdict. No photo,
// no stock art: the shape of the thing the protocol actually does.
// Purely decorative, so it is hidden from assistive technology.
export function ConsensusNodes() {
  const nodes = [
    { x: 40, y: 30 },
    { x: 20, y: 80 },
    { x: 52, y: 128 },
    { x: 108, y: 22 },
    { x: 96, y: 118 },
  ];
  const hub = { x: 210, y: 76 };

  return (
    <svg className="cn" viewBox="0 0 260 160" aria-hidden="true" focusable="false">
      {nodes.map((n, i) => (
        <line
          key={"l" + i}
          className={"cn-link cn-link-" + i}
          x1={n.x}
          y1={n.y}
          x2={hub.x}
          y2={hub.y}
        />
      ))}
      {nodes.map((n, i) => (
        <circle key={"n" + i} className={"cn-node cn-node-" + i} cx={n.x} cy={n.y} r="4.5" />
      ))}
      <polygon
        className="cn-hub"
        points="232.1,86.6 220.6,98.1 199.4,98.1 187.9,86.6 187.9,65.4 199.4,53.9 220.6,53.9 232.1,65.4"
      />
      <text className="cn-hub-text" x={hub.x} y={hub.y + 4} textAnchor="middle">
        VERDICT
      </text>
    </svg>
  );
}

// ============================================================
//  健康ダッシュボード ウィジェット (Scriptable)
//  体重の推移 と 直近7日のPFC(タンパク質/脂質/炭水化物)を線グラフ表示
// ------------------------------------------------------------
//  設定: 下の SECRET を Vercel の WIDGET_SECRET と同じ値にする
// ============================================================
const API_BASE = "https://health-dashboard-dusky-xi.vercel.app";
const SECRET = "PUT_YOUR_SECRET_HERE"; // ← Vercelの WIDGET_SECRET と一致させる

// ---- データ取得 ----
async function fetchData() {
  try {
    const req = new Request(`${API_BASE}/api/widget?key=${encodeURIComponent(SECRET)}`);
    req.timeoutInterval = 15;
    const json = await req.loadJSON();
    return { weight: json.weight || [], pfc: json.pfc || [], updatedAt: json.updatedAt };
  } catch (e) {
    return { weight: [], pfc: [], updatedAt: null, error: String(e) };
  }
}

// ---- カラー ----
const BG = new Color("#0f172a");
const CARD = new Color("#1e293b");
const TEXT = new Color("#f1f5f9");
const MUTED = new Color("#94a3b8");
const ACCENT = new Color("#818cf8");
const GREEN = new Color("#10b981");
const RED = new Color("#f43f5e");
const YELLOW = new Color("#f59e0b");

// ---- 描画キャンバス ----
const W = 640, H = 300;
const dc = new DrawContext();
dc.size = new Size(W, H);
dc.opaque = false;
dc.respectScreenScale = true;

function text(t, x, y, size, color, bold) {
  dc.setFont(bold ? Font.boldSystemFont(size) : Font.systemFont(size));
  dc.setTextColor(color);
  dc.drawText(String(t), new Point(x, y));
}

function swatch(x, y, color) {
  dc.setFillColor(color);
  dc.fillRect(new Rect(x, y + 4, 16, 16));
}

// 折れ線を描く。series = [{values:[...], color}]
function lineChart(series, x, y, w, h) {
  const all = series.flatMap((s) => s.values);
  if (all.length === 0) {
    text("データなし", x + w / 2 - 40, y + h / 2 - 10, 20, MUTED);
    return;
  }
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;
  const X = (i, n) => x + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const Y = (v) => y + h - ((v - min) / (max - min)) * h;

  // baseline
  dc.setStrokeColor(new Color("#334155"));
  dc.setLineWidth(1);
  const base = new Path();
  base.move(new Point(x, y + h));
  base.addLine(new Point(x + w, y + h));
  dc.addPath(base);
  dc.strokePath();

  for (const s of series) {
    const vals = s.values;
    if (vals.length === 0) continue;
    const path = new Path();
    vals.forEach((v, i) => {
      const p = new Point(X(i, vals.length), Y(v));
      if (i === 0) path.move(p); else path.addLine(p);
    });
    dc.addPath(path);
    dc.setStrokeColor(s.color);
    dc.setLineWidth(4);
    dc.strokePath();
    // 最新点を強調
    const lp = new Point(X(vals.length - 1, vals.length), Y(vals[vals.length - 1]));
    dc.setFillColor(s.color);
    dc.fillEllipse(new Rect(lp.x - 6, lp.y - 6, 12, 12));
  }
}

async function build() {
  const data = await fetchData();
  const weightArr = data.weight.slice(-30);
  const pfcArr = data.pfc.slice(-7);

  // ---- ヘッダー ----
  text("🏃 健康トラッカー", 28, 18, 26, TEXT, true);
  if (data.updatedAt) {
    const d = new Date(data.updatedAt);
    const label = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 更新`;
    text(label, W - 200, 24, 16, MUTED);
  }

  // ---- 左: 体重 ----
  const lastW = weightArr.length ? weightArr[weightArr.length - 1].weight : null;
  text("体重", 28, 62, 18, MUTED);
  if (lastW != null) text(`${lastW} kg`, 90, 58, 22, ACCENT, true);
  lineChart(
    [{ values: weightArr.map((d) => d.weight), color: ACCENT }],
    28, 100, 260, 165
  );

  // ---- 右: PFC (直近7日) ----
  const rx = 350;
  text("PFC (直近7日)", rx, 62, 18, MUTED);
  lineChart(
    [
      { values: pfcArr.map((d) => d.protein), color: GREEN },
      { values: pfcArr.map((d) => d.fat), color: RED },
      { values: pfcArr.map((d) => d.carbs), color: YELLOW },
    ],
    rx, 100, 262, 130
  );
  // 凡例 (最新値つき)
  const last = pfcArr.length ? pfcArr[pfcArr.length - 1] : null;
  const ly = 250;
  swatch(rx, ly, GREEN); text(`P ${last ? last.protein : "-"}g`, rx + 22, ly, 15, TEXT);
  swatch(rx + 92, ly, RED); text(`F ${last ? last.fat : "-"}g`, rx + 114, ly, 15, TEXT);
  swatch(rx + 184, ly, YELLOW); text(`C ${last ? last.carbs : "-"}g`, rx + 206, ly, 15, TEXT);

  // ---- ウィジェット組み立て ----
  const widget = new ListWidget();
  widget.backgroundColor = BG;
  widget.setPadding(0, 0, 0, 0);
  const img = widget.addImage(dc.getImage());
  img.applyFittingContentMode();
  img.centerAlignImage();
  return widget;
}

const widget = await build();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();

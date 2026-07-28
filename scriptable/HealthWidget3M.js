// ============================================================
//  健康ダッシュボード ウィジェット（3ヶ月推移 / Scriptable）
//  体重・カロリー・タンパク質・脂質・炭水化物 を折れ線表示
//  → ホーム画面には「大(Large)」サイズで追加してください
// ------------------------------------------------------------
//  設定: 下の SECRET を Vercel の WIDGET_SECRET と同じ値にする
// ============================================================
const API_BASE = "https://health-dashboard-dusky-xi.vercel.app";
const SECRET = "0a0b42d75ffabbd9acd1e5fa2fe80df0"; // Vercelの WIDGET_SECRET と一致
const DAYS = 90; // 直近3ヶ月

// ---- 目標値（ここを自分の目標に書き換えてOK） ----
const TARGETS = {
  calories: 2000, // kcal / 日
  protein: 130,   // g / 日
  fat: 55,        // g / 日
  carbs: 250,     // g / 日
};

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

// 移動平均でなめらかにする（前後 window 日を平均）。null は無視。
function smooth(values, window) {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = i - half; j <= i + half; j++) {
      const v = values[j];
      if (j >= 0 && j < values.length && v != null && !isNaN(v)) { sum += v; n++; }
    }
    return n ? sum / n : null;
  });
}

// 指定日数より古いデータを切り捨てる
function within(arr, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return arr.filter((d) => {
    const t = new Date(d.date).getTime();
    return isNaN(t) ? true : t >= cutoff;
  });
}

// ---- カラー ----
const BG = new Color("#0f172a");
const TEXT = new Color("#f1f5f9");
const MUTED = new Color("#94a3b8");
const GRID = new Color("#334155");
const COLORS = {
  weight: new Color("#818cf8"),
  calories: new Color("#38bdf8"),
  protein: new Color("#10b981"),
  fat: new Color("#f43f5e"),
  carbs: new Color("#f59e0b"),
};

// ---- 描画キャンバス ----
const W = 640, H = 640;
const dc = new DrawContext();
dc.size = new Size(W, H);
dc.opaque = false;
dc.respectScreenScale = true;

function text(t, x, y, size, color, bold) {
  dc.setFont(bold ? Font.boldSystemFont(size) : Font.systemFont(size));
  dc.setTextColor(color);
  dc.drawText(String(t), new Point(x, y));
}

// 横向きの点線を引く
function dashedLine(x1, x2, yy, color) {
  dc.setStrokeColor(color);
  dc.setLineWidth(2);
  const seg = 10, gap = 7;
  for (let xx = x1; xx < x2; xx += seg + gap) {
    const p = new Path();
    p.move(new Point(xx, yy));
    p.addLine(new Point(Math.min(xx + seg, x2), yy));
    dc.addPath(p);
    dc.strokePath();
  }
}

// 1つの折れ線パネルを描画。unit は単位、target は目標値（無い場合 null）
function panel(title, rawValues, color, unit, target, x, y, w, h) {
  // 移動平均でなめらかに（7日窓）
  const values = smooth(rawValues, 7);
  const fmt = (v) => `${Math.round(v * 10) / 10}${unit}`;
  const round0 = (v) => Math.round(v);

  const nums = values.filter((v) => v != null && !isNaN(v));
  const last = nums.length ? nums[nums.length - 1] : null;

  // --- ヘッダー1行目: タイトル（単位つき） ---
  text(`${title}（${unit}）`, x, y - 50, 19, MUTED, false);

  // --- ヘッダー2行目: 現在値（大・色付き） と 目標（小・グレー） ---
  if (last != null) {
    dc.setFont(Font.boldSystemFont(22)); dc.setTextColor(color);
    dc.drawText(`${round0(last)}${unit}`, new Point(x, y - 26));
  }
  if (target != null) {
    dc.setFont(Font.systemFont(16)); dc.setTextColor(MUTED);
    dc.drawText(`目標 ${round0(target)}`, new Point(x + w - 120, y - 23));
  }

  // 枠のベースライン
  dc.setStrokeColor(GRID);
  dc.setLineWidth(1);
  const base = new Path();
  base.move(new Point(x, y + h));
  base.addLine(new Point(x + w, y + h));
  dc.addPath(base);
  dc.strokePath();

  if (nums.length < 2) {
    text("データ不足", x + w / 2 - 40, y + h / 2 - 10, 16, MUTED);
    return;
  }

  // 目標値もスケールに含めて、目標ラインが必ず見えるようにする
  const pool = target != null ? nums.concat([target]) : nums;
  let min = Math.min(...pool), max = Math.max(...pool);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;

  const X = (i, n) => x + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const Y = (v) => y + h - ((v - min) / (max - min)) * h;

  // 目標ライン（点線）
  if (target != null) {
    dashedLine(x, x + w, Y(target), new Color(color.hex, 0.55));
  }

  // 折れ線
  const path = new Path();
  values.forEach((v, i) => {
    if (v == null || isNaN(v)) return;
    const p = new Point(X(i, values.length), Y(v));
    if (path.__started) path.addLine(p);
    else { path.move(p); path.__started = true; }
  });
  dc.addPath(path);
  dc.setStrokeColor(color);
  dc.setLineWidth(4);
  dc.strokePath();

  // 最新点を強調
  const lp = new Point(X(values.length - 1, values.length), Y(nums[nums.length - 1]));
  dc.setFillColor(color);
  dc.fillEllipse(new Rect(lp.x - 6, lp.y - 6, 12, 12));
}

async function build() {
  const data = await fetchData();
  const weightArr = within(data.weight, DAYS);
  const pfcArr = within(data.pfc, DAYS);

  // ---- ヘッダー ----
  text("🏃 健康トラッカー（直近3ヶ月）", 24, 20, 26, TEXT, true);

  // データ基準日時
  let stamp = "データなし";
  if (data.updatedAt) {
    const d = new Date(data.updatedAt);
    stamp = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 時点`;
  }
  text(stamp, 24, 52, 16, MUTED);

  // ---- 5つのパネルをグリッド配置 ----
  // 上段: 体重(横長)  下段2x2: カロリー/P/F/C
  const marginX = 30;
  const colW = (W - marginX * 3) / 2; // 2列
  const topY = 152;
  const rowH = 94;
  const gapY = 72; // 2行ヘッダー分の余白（下段まで確実に収める）

  // 体重（上段・横幅いっぱい、目標なし）
  panel("体重", weightArr.map((d) => d.weight), COLORS.weight, "kg", null,
    marginX, topY, W - marginX * 2, rowH);

  const grid = [
    { t: "カロリー", key: "calories", c: COLORS.calories, u: "kcal", tg: TARGETS.calories },
    { t: "タンパク質", key: "protein", c: COLORS.protein, u: "g", tg: TARGETS.protein },
    { t: "脂質", key: "fat", c: COLORS.fat, u: "g", tg: TARGETS.fat },
    { t: "炭水化物", key: "carbs", c: COLORS.carbs, u: "g", tg: TARGETS.carbs },
  ];
  grid.forEach((g, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const px = marginX + col * (colW + marginX);
    const py = topY + rowH + gapY + row * (rowH + gapY);
    panel(g.t, pfcArr.map((d) => d[g.key]), g.c, g.u, g.tg, px, py, colW, rowH);
  });

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
  await widget.presentLarge();
}
Script.complete();

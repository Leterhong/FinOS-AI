# -*- coding: utf-8 -*-
"""生成片头卡 / 结尾链路卡（1920x1080 深色品牌风）"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

W, H = 1920, 1080
BG = (10, 14, 19)
GREEN = (0, 214, 143)
WHITE = (240, 246, 252)
GRAY = (150, 162, 175)
DIM = (90, 101, 114)
CARD_BG = (19, 25, 32)
CARD_BD = (38, 48, 60)

FBD = r"C:\Windows\Fonts\msyhbd.ttc"
FRG = r"C:\Windows\Fonts\msyh.ttc"
OUT = Path(__file__).parent / "cards"
OUT.mkdir(exist_ok=True)


def f(path, size):
    return ImageFont.truetype(path, size, index=0)


def tw(d, text, font):
    b = d.textbbox((0, 0), text, font=font)
    return b[2] - b[0], b[3] - b[1]


def center(d, text, font, y, fill, width=W):
    w, _ = tw(d, text, font)
    d.text(((width - w) / 2, y), text, font=font, fill=fill)


def glow_base():
    """深色底 + 中心绿色辉光"""
    img = Image.new("RGB", (W, H), BG)
    # 手绘径向辉光
    import math
    glow = Image.new("RGB", (W, H), BG)
    px = glow.load()
    cx, cy = W / 2, H * 0.55
    for y in range(0, H, 4):
        for x in range(0, W, 4):
            d = math.hypot((x - cx) / 900, (y - cy) / 700)
            k = max(0.0, 1 - d) ** 2.4
            r, g, b = BG
            nr = int(r + (10, 62, 44)[0] * k)
            ng = int(g + (10, 62, 44)[1] * k)
            nb = int(b + (10, 62, 44)[2] * k)
            for dy in range(4):
                for dx in range(4):
                    if x + dx < W and y + dy < H:
                        px[x + dx, y + dy] = (nr, ng, nb)
    return glow


# ---------------- 片头卡 ----------------
def make_intro():
    img = glow_base()
    d = ImageDraw.Draw(img)

    # 左上品牌点
    d.ellipse([96, 92, 116, 112], fill=GREEN)
    d.text((132, 88), "FinOS AI", font=f(FRG, 34), fill=GRAY)

    center(d, "FinOS AI", f(FBD, 148), 330, GREEN)

    # 分隔线
    d.line([(W / 2 - 260, 540), (W / 2 + 260, 540)], fill=(28, 90, 68), width=3)

    center(d, "面向企业经营与风险研判的开源金融服务 Agent", f(FRG, 50), 585, WHITE)

    center(d, "Evidence first   ·   Human in the loop   ·   Open and self-hosted",
           f(FRG, 30), 780, DIM)

    img.save(OUT / "card_intro.png")
    print("card_intro.png")


# ---------------- 结尾链路卡 ----------------
def make_flow():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    center(d, "从资料到研判，一条链路跑通", f(FBD, 62), 118, WHITE)

    steps = ["企业经营项目", "资料解析", "事实抽取", "规则匹配", "风险信号", "流程任务"]
    bw, bh, gap = 252, 122, 46
    total = len(steps) * bw + (len(steps) - 1) * gap
    x0 = (W - total) / 2
    y0 = 400

    fo = f(FBD, 32)
    for i, s in enumerate(steps):
        x = x0 + i * (bw + gap)
        d.rounded_rectangle([x, y0, x + bw, y0 + bh], radius=16,
                            fill=CARD_BG, outline=CARD_BD, width=2)
        # 序号
        d.ellipse([x + 20, y0 + 20, x + 48, y0 + 48], fill=GREEN)
        d.text((x + 28, y0 + 22), str(i + 1), font=f(FBD, 20), fill=(6, 20, 15))
        # 名称
        w, _ = tw(d, s, fo)
        d.text((x + (bw - w) / 2, y0 + 62), s, font=fo, fill=WHITE)
        # 箭头
        if i < len(steps) - 1:
            ax = x + bw + 8
            ay = y0 + bh / 2
            d.line([(ax, ay), (ax + gap - 18, ay)], fill=(0, 150, 105), width=4)
            d.polygon([(ax + gap - 18, ay - 9), (ax + gap - 2, ay), (ax + gap - 18, ay + 9)],
                      fill=(0, 150, 105))

    center(d, "证据引用  ·  人工核验  ·  研判建议", f(FBD, 36), 620, GREEN)

    d.line([(W / 2 - 380, 726), (W / 2 + 380, 726)], fill=(28, 48, 42), width=2)

    center(d, "零预置数据   ·   私有化部署   ·   代码开源 MIT", f(FRG, 34), 790, GRAY)

    img.save(OUT / "card_flow.png")
    print("card_flow.png")


if __name__ == "__main__":
    make_intro()
    make_flow()

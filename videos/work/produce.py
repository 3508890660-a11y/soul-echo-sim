from __future__ import annotations

import asyncio
import json
import math
import subprocess
import wave
from pathlib import Path

import edge_tts
import imageio_ffmpeg
import numpy as np
from mutagen.mp3 import MP3
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(r"F:/producing/novel/EX4以自创card game为主题/game_soul_echo")
WORK = ROOT / "videos" / "work"
OUT = ROOT / "videos"
MATCH = json.loads((WORK / "match-grand-20261517.json").read_text(encoding="utf-8"))
MATCH3 = json.loads((WORK / "match-standard-20300709.json").read_text(encoding="utf-8"))
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS, SR = 1920, 1080, 24, 48000
VOICE = "zh-CN-YunxiNeural"
RATE = "+8%"

BG = "#07110f"
PANEL = "#0d1b17"
PANEL2 = "#12231e"
GOLD = "#d2ad64"
TEXT = "#ece8dc"
MUTED = "#91a198"
LINE = "#2a3c34"
WHITE = "#d8cfb3"
RED = "#d26a58"
GREEN = "#6fa87a"
COLORS = {
    "白": "#d8cfb3", "黑": "#806a91", "红": "#d26a58", "蓝": "#6496c7",
    "紫": "#aa78b9", "绿": "#6fa87a", "黄": "#d0af4e", "灰": "#87928d",
}
FONT_REG = r"C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = r"C:/Windows/Fonts/msyhbd.ttc"
ASSETS = {
    "template": ROOT.parent / "Soul Echo灵魂回响（以创之界限规则为灵感）" / "卡牌基础模版.png",
    "field": ROOT.parent / "Soul Echo灵魂回响（以创之界限规则为灵感）" / "场地.jpg",
    "deck": ROOT / "verification" / "se01-deck.png",
    "duel": ROOT / "verification" / "se01-duel.png",
    "desktop": ROOT / "verification" / "desktop.png",
}


def fnt(size: int, bold: bool = False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


def rgb(c: str):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def mix(a: str, b: str, t: float):
    aa, bb = rgb(a), rgb(b)
    return tuple(round(aa[i] * (1 - t) + bb[i] * t) for i in range(3))


def ease(x: float):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int, max_lines: int = 0):
    lines, cur = [], ""
    no_lead = "，。、；：！？）」』”’…%"
    for ch in text:
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        trial = cur + ch
        prev = cur[-1] if cur else ""
        if cur and draw.textlength(trial, font=font) > width:
            keep = (ch in no_lead
                    or (ch.isdigit() and prev.isdigit())
                    or (ch.isascii() and ch.isalnum() and prev.isascii() and prev.isalnum()))
            if keep:
                cur = trial
            else:
                lines.append(cur)
                cur = ch
        else:
            cur = trial
    if cur:
        lines.append(cur)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and draw.textlength(last + "…", font=font) > width:
            last = last[:-1]
        lines[-1] = last + "…"
    return lines


def text_block(draw, xy, text, font, fill, width, spacing=10, max_lines=0, anchor="la"):
    x, y = xy
    lines = wrap(draw, text, font, width, max_lines)
    line_h = font.size + spacing
    for i, line in enumerate(lines):
        draw.text((x, y + i * line_h), line, font=font, fill=fill, anchor=anchor)
    return y + len(lines) * line_h


def brand(draw, x=70, y=54, scale=1.0):
    r = 24 * scale
    pts = [(x + r * math.cos(math.radians(30 + i * 60)), y + r * math.sin(math.radians(30 + i * 60))) for i in range(6)]
    draw.polygon(pts, outline=GOLD, width=max(1, round(2 * scale)))
    draw.arc((x - 15 * scale, y - 10 * scale, x + 15 * scale, y + 10 * scale), 200, 340, fill=GOLD, width=2)
    draw.arc((x - 15 * scale, y - 10 * scale, x + 15 * scale, y + 10 * scale), 20, 160, fill=GOLD, width=2)
    draw.ellipse((x - 3 * scale, y - 3 * scale, x + 3 * scale, y + 3 * scale), fill=GOLD)


def base_image(accent=GOLD):
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    top = np.array(rgb("#0c1915"), dtype=np.float32)[None, None, :]
    bot = np.array(rgb("#050b0a"), dtype=np.float32)[None, None, :]
    arr = np.repeat(top * (1 - yy) + bot * yy, W, axis=1)
    img = Image.fromarray(np.uint8(arr), "RGB")
    d = ImageDraw.Draw(img, "RGBA")
    for x in range(0, W, 96):
        d.line((x, 0, x, H), fill=(*rgb(LINE), 28), width=1)
    for y in range(0, H, 96):
        d.line((0, y, W, y), fill=(*rgb(LINE), 22), width=1)
    for cx, cy, r, a in [(1580, 180, 420, 18), (220, 880, 360, 12)]:
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(*rgb(accent), a), width=2)
        d.ellipse((cx - r * .72, cy - r * .72, cx + r * .72, cy + r * .72), outline=(*rgb(accent), a // 2), width=1)
    d.rectangle((0, 0, W, 5), fill=accent)
    return img


BASE = base_image()
BASE_RED = base_image(RED)


def header(img, section, num=None):
    d = ImageDraw.Draw(img, "RGBA")
    brand(d)
    d.text((112, 38), "灵魂回响", font=fnt(28, True), fill=TEXT)
    d.text((113, 72), "SOUL ECHO", font=fnt(13), fill=GOLD)
    d.text((1840, 50), section, font=fnt(20), fill=MUTED, anchor="ra")
    if num is not None:
        d.text((1840, 82), f"CHAPTER {num:02d}", font=fnt(12), fill=GOLD, anchor="ra")
    d.line((70, 106, 1850, 106), fill=(*rgb(LINE), 180), width=1)


def subtitle(img, text):
    d = ImageDraw.Draw(img, "RGBA")
    d.rounded_rectangle((94, 895, 1826, 1035), radius=18, fill=(3, 10, 8, 226), outline=(*rgb(LINE), 220), width=1)
    d.rectangle((94, 918, 99, 1012), fill=GOLD)
    lines = wrap(d, text, fnt(32), 1630, 3)
    total = len(lines) * 43
    y = 965 - total / 2
    for line in lines:
        d.text((130, y), line, font=fnt(32), fill=TEXT)
        y += 43


def chip(draw, box, text, color=GOLD, size=20):
    draw.rounded_rectangle(box, radius=14, fill=(*rgb(color), 24), outline=(*rgb(color), 130), width=1)
    x1, y1, x2, y2 = box
    draw.text(((x1 + x2) / 2, (y1 + y2) / 2 - 1), text, font=fnt(size, True), fill=color, anchor="mm")


def metric(draw, x, y, w, value, label, color=GOLD):
    draw.rounded_rectangle((x, y, x + w, y + 145), radius=18, fill=(*rgb(PANEL2), 230), outline=(*rgb(LINE), 210), width=1)
    draw.text((x + 24, y + 16), value, font=fnt(54, True), fill=color)
    draw.text((x + 25, y + 92), label, font=fnt(21), fill=MUTED)


def paste_fit(img, path, box, border=GOLD):
    x1, y1, x2, y2 = map(int, box)
    bw, bh = x2 - x1, y2 - y1
    src = Image.open(path).convert("RGB")
    fitted = ImageOps.contain(src, (bw - 4, bh - 4), Image.Resampling.LANCZOS)
    d = ImageDraw.Draw(img, "RGBA")
    d.rounded_rectangle((x1, y1, x2, y2), radius=18, fill=(*rgb(PANEL), 245), outline=(*rgb(border), 130), width=2)
    px = x1 + (bw - fitted.width) // 2
    py = y1 + (bh - fitted.height) // 2
    img.paste(fitted, (px, py))


def card_tile(draw, box, name, color="灰", stats="", active=False, small=False):
    x1, y1, x2, y2 = box
    c = COLORS.get(color, GOLD)
    draw.rounded_rectangle(box, radius=10, fill=(*rgb("#13221d"), 250), outline=(*rgb(c), 220 if active else 100), width=3 if active else 1)
    draw.rectangle((x1, y1, x1 + 6, y2), fill=c)
    draw.text((x1 + 16, y1 + 12), name, font=fnt(17 if small else 21, True), fill=TEXT)
    if stats:
        draw.text((x1 + 16, y2 - 29), stats, font=fnt(14 if small else 17), fill=MUTED)


def title_content(scene):
    img = BASE.copy()
    d = ImageDraw.Draw(img, "RGBA")
    brand(d, 960, 230, 3.2)
    d.text((960, 360), "从一张卡面，到第一声回响", font=fnt(68, True), fill=TEXT, anchor="mm")
    d.text((960, 448), "灵魂回响  SOUL ECHO", font=fnt(32), fill=GOLD, anchor="mm")
    d.line((690, 510, 1230, 510), fill=(*rgb(GOLD), 150), width=2)
    chip(d, (710, 555, 960, 612), "项目纪实", GOLD, 24)
    chip(d, (980, 555, 1230, 612), "规则速览", GREEN, 24)
    d.text((960, 700), "素材原型  ×  第一弹卡包  ×  确定性引擎  ×  模型对阵", font=fnt(26), fill=MUTED, anchor="mm")
    subtitle(img, scene["narration"])
    return img


def prototype_content(scene):
    img = BASE.copy()
    header(img, "素材与原型｜前期数月", 2)
    paste_fit(img, ASSETS["template"], (90, 150, 740, 835), GOLD)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((820, 175), "先有世界，后有规则", font=fnt(52, True), fill=TEXT)
    d.text((824, 255), "卡面模板只是起点，八色虚构层才是机制的地基。", font=fnt(26), fill=MUTED)
    for i, c in enumerate(["白", "黑", "红", "蓝", "紫", "绿", "黄", "灰"]):
        x = 850 + (i % 4) * 220
        y = 355 + (i // 4) * 155
        d.ellipse((x, y, x + 72, y + 72), fill=(*rgb(COLORS[c]), 45), outline=COLORS[c], width=2)
        d.text((x + 36, y + 36), c, font=fnt(28, True), fill=COLORS[c], anchor="mm")
        d.text((x + 92, y + 36), {"白":"守护","黑":"回收","红":"快攻","蓝":"抽牌","紫":"衍生物","绿":"加速","黄":"触发","灰":"泛用"}[c], font=fnt(22), fill=TEXT, anchor="lm")
    d.rounded_rectangle((820, 690, 1740, 810), radius=18, fill=(*rgb(PANEL2), 220))
    d.text((850, 718), "卡面／场地／角色设定", font=fnt(28, True), fill=GOLD)
    d.text((850, 765), "从视觉骨架到可测试的卡牌系统", font=fnt(24), fill=MUTED)
    subtitle(img, scene["narration"])
    return img


def rules_content(scene):
    img = BASE.copy()
    header(img, "规则整理｜集中形成闭环", 3)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((100, 155), "把分散的设计稿，整理成可执行的裁定顺序", font=fnt(43, True), fill=TEXT)
    items = ["优先权", "连锁", "状态检查", "战斗", "生命结算"]
    for i, item in enumerate(items):
        x = 100 + i * 345
        chip(d, (x, 280, x + 260, 355), item, GOLD if i < 3 else GREEN, 27)
        if i < len(items) - 1:
            d.text((x + 304, 316), "→", font=fnt(30), fill=MUTED, anchor="mm")
    metric(d, 100, 460, 440, "0.2", "规则版本")
    metric(d, 580, 460, 440, "30", "词条完成闭环")
    metric(d, 1060, 460, 340, "21", "规则回归测试")
    metric(d, 1440, 460, 340, "6×40", "真人测试原型", GREEN)
    d.rounded_rectangle((100, 665, 1780, 810), radius=18, fill=(*rgb(RED), 15), outline=(*rgb(RED), 100))
    d.text((135, 694), "测试暴露的问题", font=fnt(24, True), fill=RED)
    d.text((135, 745), "每个颜色都需要灰色补位 → 直接催生第一弹卡包", font=fnt(31), fill=TEXT)
    subtitle(img, scene["narration"])
    return img


def resource_content(scene):
    img = BASE.copy()
    header(img, "规则速览 ①｜灵质与灵能", 4)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((100, 150), "每一点资源，都来自一次手牌取舍", font=fnt(47, True), fill=TEXT)
    card_tile(d, (145, 300, 485, 560), "一张手牌", "蓝", "进入灵质区后，不再作为手牌使用", True)
    d.text((570, 430), "→", font=fnt(74), fill=GOLD, anchor="mm")
    card_tile(d, (680, 300, 1020, 560), "设置为灵质", "绿", "主要阶段中，通常每回合一次", True)
    d.text((1100, 430), "→", font=fnt(74), fill=GOLD, anchor="mm")
    d.rounded_rectangle((1210, 300, 1700, 560), radius=20, fill=(*rgb(GOLD), 20), outline=(*rgb(GOLD), 130), width=2)
    d.text((1455, 355), "横置", font=fnt(28, True), fill=MUTED, anchor="mm")
    d.text((1455, 435), "+1 灵能", font=fnt(58, True), fill=GOLD, anchor="mm")
    d.text((1455, 505), "支付对应颜色与灰色费用", font=fnt(22), fill=TEXT, anchor="mm")
    d.rounded_rectangle((145, 650, 1700, 810), radius=18, fill=(*rgb(PANEL2), 230))
    d.text((185, 682), "资源决策", font=fnt(25, True), fill=GREEN)
    d.text((185, 738), "是保留这张牌的效果，还是把它变成后续行动的资源？", font=fnt(34), fill=TEXT)
    subtitle(img, scene["narration"])
    return img


def combat_content(scene):
    img = BASE.copy()
    header(img, "规则速览 ②｜战斗与生命", 5)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((100, 141), "攻击力解决场面，冲击力削减生命", font=fnt(44, True), fill=TEXT)
    turns = ["开始阶段", "主要阶段一", "战斗阶段", "主要阶段二", "结束步骤"]
    for i, t in enumerate(turns):
        x = 100 + i * 340
        chip(d, (x, 212, x + 280, 262), t, GREEN if i == 2 else MUTED, 19)
        if i < len(turns) - 1:
            d.text((x + 310, 237), "→", font=fnt(20), fill=MUTED, anchor="mm")
    d.rounded_rectangle((120, 290, 470, 520), radius=18, fill=(*rgb(PANEL2), 230), outline=(*rgb(RED), 100))
    d.text((150, 312), "灵像战斗", font=fnt(26, True), fill=RED)
    card_tile(d, (150, 352, 290, 468), "烈焰斗士", "红", "4000 攻／2500 生", True, True)
    card_tile(d, (312, 352, 452, 468), "圣所守卫", "白", "2500 攻／4000 生", False, True)
    d.text((295, 410), "⇄", font=fnt(26, True), fill=MUTED, anchor="mm")
    d.text((150, 487), "攻击力比较后，差额成为伤害", font=fnt(16), fill=MUTED)
    d.rounded_rectangle((535, 290, 885, 520), radius=18, fill=(*rgb(PANEL2), 230), outline=(*rgb(GOLD), 100))
    d.text((565, 312), "未被阻挡", font=fnt(26, True), fill=GOLD)
    card_tile(d, (565, 352, 700, 468), "烈焰斗士", "红", "冲击 2", True, True)
    d.text((722, 408), "→", font=fnt(30, True), fill=GOLD, anchor="mm")
    d.rounded_rectangle((755, 352, 862, 468), radius=10, fill=(*rgb("#13221d"), 250), outline=(*rgb(GOLD), 220), width=2)
    d.text((808, 380), "灵体", font=fnt(19, True), fill=TEXT, anchor="mm")
    d.text((808, 418), "生命 −2", font=fnt(17), fill=RED, anchor="mm")
    d.text((565, 487), "冲击力直接削减对方生命卡组", font=fnt(16), fill=MUTED)
    d.rounded_rectangle((950, 290, 1765, 520), radius=18, fill=(*rgb(PANEL2), 230), outline=(*rgb(GOLD), 100))
    d.text((990, 312), "生命卡逐张揭示", font=fnt(31, True), fill=GOLD)
    for i, name in enumerate(["生命顶牌", "触发效果", "移往分解区"]):
        chip(d, (990 + i * 245, 395, 1205 + i * 245, 462), name, GOLD if i == 1 else GREEN, 19)
    d.rounded_rectangle((120, 575, 1765, 805), radius=20, fill=(*rgb(RED), 15), outline=(*rgb(RED), 120), width=2)
    d.text((160, 612), "生命卡组为空  ≠  立即落败", font=fnt(48, True), fill=RED)
    d.text((160, 705), "生命卡组为空，且仍须结算至少 1 点生命伤害，才确定胜负。", font=fnt(30), fill=TEXT)
    subtitle(img, scene["narration"])
    return img


def modes_content(scene):
    img = BASE.copy()
    header(img, "规则速览 ③｜灵体与四种模式", 6)
    d = ImageDraw.Draw(img, "RGBA")
    d.rounded_rectangle((95, 150, 590, 810), radius=20, fill=(*rgb(PANEL2), 220), outline=(*rgb(GOLD), 100))
    brand(d, 342, 275, 2.8)
    d.text((342, 405), "灵体", font=fnt(52, True), fill=TEXT, anchor="mm")
    d.text((342, 480), "通用：检视牌堆顶卡", font=fnt(25), fill=MUTED, anchor="mm")
    d.text((342, 535), "＋", font=fnt(22), fill=GOLD, anchor="mm")
    d.text((342, 595), "专属：卡面所写能力", font=fnt(28, True), fill=GREEN, anchor="mm")
    d.text((342, 690), "每名玩家一张\n不计入主卡组", font=fnt(23), fill=MUTED, anchor="mm", align="center")
    modes = [
        ("标准", "10 生命｜4 起手", "40—60 主卡组"),
        ("速攻", "6 生命｜4 起手", "40—60 主卡组"),
        ("长局", "15 生命｜5 起手", "50—60 主卡组"),
        ("双色", "12 生命｜4 起手", "两种非灰颜色，各 ≥10 张"),
    ]
    for i, (name, a, b) in enumerate(modes):
        x = 660 + (i % 2) * 580
        y = 170 + (i // 2) * 310
        d.rounded_rectangle((x, y, x + 530, y + 260), radius=20, fill=(*rgb(PANEL2), 230), outline=(*rgb(GREEN if i == 2 else GOLD), 110))
        d.text((x + 35, y + 30), name, font=fnt(43, True), fill=GREEN if i == 2 else GOLD)
        d.text((x + 35, y + 110), a, font=fnt(29), fill=TEXT)
        d.text((x + 35, y + 170), b, font=fnt(25), fill=MUTED)
    d.text((1240, 785), "只调整参数，不改变核心回合结构", font=fnt(26), fill=TEXT, anchor="mm")
    subtitle(img, scene["narration"])
    return img


def first_set_content(scene):
    img = BASE.copy()
    header(img, "第一弹《第一声回响》", 7)
    paste_fit(img, ASSETS["deck"], (690, 145, 1830, 840), GOLD)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((95, 160), "148", font=fnt(128, True), fill=GOLD)
    d.text((110, 305), "名目", font=fnt(34, True), fill=TEXT)
    d.text((110, 380), "140 个主卡组卡名", font=fnt(31), fill=TEXT)
    d.text((110, 435), "+ 8 位灵体", font=fnt(31), fill=GREEN)
    for i, name in enumerate(["微响", "叠响", "共鸣", "绝响"]):
        chip(d, (110 + (i % 2) * 240, 530 + (i // 2) * 90, 320 + (i % 2) * 240, 595 + (i // 2) * 90), name, GOLD if i > 1 else GREEN, 23)
    d.text((110, 745), "绿黄：扶正旧设计＋新增", font=fnt(25), fill=MUTED)
    d.text((110, 795), "结构／卡表／数值审计同步落地", font=fnt(25), fill=TEXT)
    subtitle(img, scene["narration"])
    return img


def constraint_content(scene):
    img = BASE.copy()
    header(img, "构筑约束｜同色 ≥60%", 8)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((100, 145), "灵体是核心，不是招牌", font=fnt(46, True), fill=TEXT)
    d.rounded_rectangle((95, 230, 640, 590), radius=22, fill=(*rgb(GOLD), 16), outline=(*rgb(GOLD), 120), width=2)
    d.text((368, 300), "≥ 60%", font=fnt(96, True), fill=GOLD, anchor="mm")
    d.text((368, 400), "主卡组须与灵体同色", font=fnt(26, True), fill=TEXT, anchor="mm")
    d.text((368, 460), "四十张的精简构筑", font=fnt(22), fill=MUTED, anchor="mm")
    d.text((368, 500), "也至少要二十四张同色", font=fnt(22), fill=MUTED, anchor="mm")
    d.text((368, 550), "四种模式一律生效", font=fnt(22), fill=GREEN, anchor="mm")
    rules = [
        ("混色卡", "只按第一颜色计一次，不按支付方式", GOLD),
        ("灰卡", "中性色；只有灵体本身是灰时才算同色", MUTED),
        ("灵体", "不进分子也不进分母，它不在主卡组里", GREEN),
    ]
    for i, (name, body, color) in enumerate(rules):
        y = 240 + i * 118
        d.rounded_rectangle((700, y, 1800, y + 96), radius=18, fill=(*rgb(PANEL2), 220), outline=(*rgb(LINE), 200))
        d.text((730, y + 26), name, font=fnt(28, True), fill=color)
        d.text((880, y + 32), body, font=fnt(25), fill=TEXT)
    d.rounded_rectangle((95, 640, 1800, 845), radius=20, fill=(*rgb(RED), 15), outline=(*rgb(RED), 110))
    d.text((135, 668), "规则生效当天的影响", font=fnt(26, True), fill=RED)
    d.text((135, 720), "十二份卡组只有四份达标；八份里，六份纯度不足，两份连灵体都挂错了颜色。", font=fnt(29), fill=TEXT)
    d.text((135, 782), "于是旧构筑规则废除，十二个模型拿新简报重新组卡——冠军也随之换人。", font=fnt(29), fill=TEXT)
    subtitle(img, scene["narration"])
    return img


def engine_content(scene):
    img = BASE.copy()
    header(img, "引擎与工具｜并行搭建", 9)
    paste_fit(img, ASSETS["desktop"], (850, 150, 1815, 830), GREEN)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((95, 155), "让设计真正运行", font=fnt(48, True), fill=TEXT)
    for i, name in enumerate(["卡表 Markdown", "生成器", "确定性引擎"]):
        y = 275 + i * 120
        chip(d, (110, y, 600, y + 70), name, GOLD if i == 0 else GREEN, 25)
        if i < 2:
            d.text((355, y + 95), "↓", font=fnt(28), fill=MUTED, anchor="mm")
    d.text((110, 620), "95 张新卡", font=fnt(43, True), fill=GOLD)
    d.text((110, 680), "进入声明式效果表", font=fnt(26), fill=TEXT)
    d.text((110, 745), "观战台／组卡器／热座对战／卡面", font=fnt(24), fill=MUTED)
    d.text((110, 790), "卡面由位图模板改为 SVG 纯函数", font=fnt(22), fill=MUTED)
    subtitle(img, scene["narration"])
    return img


def ai_content(scene):
    img = BASE.copy()
    header(img, "12 模型对阵台", 10)
    d = ImageDraw.Draw(img, "RGBA")
    cx, cy = 960, 400
    d.ellipse((cx - 135, cy - 135, cx + 135, cy + 135), fill=(*rgb(GOLD), 20), outline=(*rgb(GOLD), 160), width=2)
    d.text((cx, cy - 18), "同一接口", font=fnt(34, True), fill=TEXT, anchor="mm")
    d.text((cx, cy + 38), "各自组卡·各自决策", font=fnt(21), fill=MUTED, anchor="mm")
    for i in range(12):
        ang = math.radians(i * 30 - 90)
        x, y = cx + 380 * math.cos(ang), cy + 240 * math.sin(ang)
        d.line((cx + 140 * math.cos(ang), cy + 140 * math.sin(ang), x, y), fill=(*rgb(LINE), 180), width=2)
        d.ellipse((x - 28, y - 28, x + 28, y + 28), fill=(*rgb(GREEN if i % 3 else GOLD), 55), outline=GREEN if i % 3 else GOLD, width=2)
        d.text((x, y), str(i + 1), font=fnt(18, True), fill=TEXT, anchor="mm")
    metric(d, 95, 680, 490, "1056", "四模式循环赛", GOLD)
    metric(d, 715, 680, 490, "360", "三届瑞士轮", GREEN)
    metric(d, 1335, 680, 490, "4", "暴露问题：3 引擎＋1 简报", RED)
    subtitle(img, scene["narration"])
    return img


def results_content(scene):
    img = BASE.copy()
    header(img, "12 模型对阵结果｜加权胜率", 11)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((100, 128), "同色六成之后：冠军第一次是红", font=fnt(48, True), fill=TEXT)
    rows = [
        ("1", "赤蓝燃穿", "红", "50 张｜红 34 蓝 16", .718, RED),
        ("2", "余烬共鸣", "红", "50 张｜红 41 黑 4 灰 5", .677, RED),
        ("3", "圣所铁壁", "白", "56 张｜白 45 黄 11", .623, WHITE),
        ("4", "根脉奔流", "绿", "50 张｜绿 34 白 16", .614, GREEN),
    ]
    for i, (rank, name, color, cards, score, accent) in enumerate(rows):
        y = 196 + i * 96
        d.rounded_rectangle((100, y, 1820, y + 82), radius=16, fill=(*rgb(PANEL2), 225), outline=(*rgb(accent), 90))
        d.text((140, y + 40), rank, font=fnt(34, True), fill=accent, anchor="lm")
        d.text((200, y + 40), name, font=fnt(32, True), fill=TEXT, anchor="lm")
        d.text((470, y + 40), color, font=fnt(24, True), fill=COLORS[color], anchor="lm")
        d.text((540, y + 40), cards, font=fnt(21), fill=MUTED, anchor="lm")
        d.rounded_rectangle((1000, y + 32, 1620, y + 50), radius=9, fill=(*rgb(LINE), 90))
        d.rounded_rectangle((1000, y + 32, 1000 + 620 * (score / .78), y + 50), radius=9, fill=(*rgb(accent), 205))
        d.text((1800, y + 40), f"{score * 100:.1f}%", font=fnt(32, True), fill=accent, anchor="rm")
    d.rounded_rectangle((100, 610, 1820, 850), radius=20, fill=(*rgb(GOLD), 14), outline=(*rgb(GOLD), 105))
    d.text((135, 638), "规则收紧后，卡组被迫围着灵体造", font=fnt(27, True), fill=GOLD)
    d.text((135, 688), "十二份全部合规（同色 65%–84%）。主色分布从旧届的红九绿一白二，变成红七绿四白一。", font=fnt(25), fill=TEXT)
    d.text((135, 737), "上届冠军的白墙退到第三（62.3%），上届亚军从 71.8% 掉到 51.4%；末位 17.7%，极差从 70.0 收窄到 54.1。", font=fnt(25), fill=TEXT)
    d.text((135, 792), "代价最隐蔽的一条：灰卡在同色统计里一律不计，带六张灰等于先让出一成配额。", font=fnt(22), fill=MUTED)
    subtitle(img, scene["narration"])
    return img


def final_content(scene):
    img = BASE.copy()
    header(img, "当前状态", 12)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((960, 205), "可运行  ·  可复现  ·  可扩展", font=fnt(60, True), fill=GOLD, anchor="mm")
    d.text((960, 340), "53  →  148 名目", font=fnt(74, True), fill=TEXT, anchor="mm")
    metric(d, 220, 480, 430, "21", "规则回归")
    metric(d, 745, 480, 430, "35", "脚本自检", GREEN)
    metric(d, 1270, 480, 430, "12", "预组冒烟")
    d.text((960, 720), "第一声回响，已经响起。", font=fnt(48, True), fill=TEXT, anchor="mm")
    d.text((960, 795), "下一轮测试，才刚刚开始。", font=fnt(31), fill=MUTED, anchor="mm")
    subtitle(img, scene["narration"])
    return img


VIDEO1 = [
    {"kind": "title", "min": 5.5, "narration": "一套卡牌，如何从一张模板，长成一座 AI 对阵台？"},
    {"kind": "prototype", "min": 12, "narration": "项目最初经历了数月的素材积累。卡面、场地与角色设定逐步落盘，八色虚构层先后成形。先有世界，后有规则；每种颜色的机制，都从设定反推。"},
    {"kind": "rules", "min": 12, "narration": "随后，分散的规则稿被集中整理。优先权、连锁、状态检查、战斗与生命结算形成闭环，三十项词条落定。自动化裁定通过后，六套原型进入真人测试；每色依赖灰色补位的问题，也随之显现。"},
    {"kind": "resource", "min": 13, "narration": "双方以生命卡组和起手牌开局。主要阶段中，每回合通常可以将一张手牌设为灵质；横置灵质，产生对应颜色的灵能，用来支付灵像与灵感的费用。"},
    {"kind": "combat", "min": 16, "narration": "一个回合从开始阶段的重置、能力与抽牌开始，依次经过主要阶段一、战斗阶段、主要阶段二，最后是结束步骤。未被阻挡地攻击对方灵体时，以冲击力削减生命卡组。生命卡逐张揭示，还可能触发效果。生命卡组打空不会立即落败；只有仍须结算至少一点生命伤害时，胜负才最终确定。"},
    {"kind": "modes", "min": 13, "narration": "每名玩家有一张灵体。检视牌堆顶是它的通用能力，此外每张灵体还带一项写在卡面上的专属能力。四种模式只调整初始生命、起手数量与构筑条件，共用同一套核心回合和战斗规则。"},
    {"kind": "first_set", "min": 12, "narration": "紧接着，第一弹《第一声回响》完成。一百四十八名目被拆分为卡包结构、逐张卡表与数值审计。绿与黄不是临时新造，而是扶正旧设计，再补全新卡。"},
    {"kind": "constraint", "min": 14, "narration": "第一弹之后，构筑规则又收紧了一道：主卡组里与灵体同色的卡牌，必须占到六成。计数口径也一并定死：混色卡只按第一颜色算一次，灰卡只有灰灵体时才算，灵体本身不进分子也不进分母。规则生效当天，十二份卡组只有四份达标；于是旧规则废除，十二个模型全部重来。"},
    {"kind": "engine", "min": 12, "narration": "引擎与工具并行搭建。卡表成为唯一数据源，九十五张新卡进入声明式效果表；观战台、组卡器、热座对战与卡面生成逐一接通，四种模式共用同一套接口。"},
    {"kind": "ai", "min": 12, "narration": "十二个模型拿到彼此隔离的资料，各自组卡、各自决策，在四种模式里打满一千零五十六局循环赛，又加了三届瑞士轮。对阵不仅排出名次，也抓出了三处引擎缺陷，并纠正一处派发简报的错误。"},
    {"kind": "results", "num": 11, "min": 17, "narration": "十二份卡组全部合规，同色率从六成五到八成四。主色从旧届的红九绿一白二，变成红七绿四白一。冠军第一次是红：赤蓝燃穿，五十张里三十四张红，七十一点八。上届冠军的白墙退到第三，上届亚军从七十一点八掉到五十一点四。"},
    {"kind": "final", "min": 10, "narration": "从五十三个卡名到一百四十八个名目，从规则文档到对阵系统，灵魂回响已经可运行、可复现、可扩展。第一声回响，已经响起；下一轮测试，才刚刚开始。"},
]


def find_step(turn, contains, occurrence=0, after=0):
    found = []
    for i, step in enumerate(MATCH["steps"]):
        if i < after:
            continue
        if step["snap"]["turn"] == turn and contains in step["text"]:
            found.append(i)
    if not found:
        raise ValueError((turn, contains, occurrence))
    return found[min(occurrence, len(found) - 1)]


ST = {
    "start": 0,
    "bird": find_step(6, "火焰鸟 的生命伤害事件结束"),
    "deficit": 174,
    "guard": find_step(9, "圣所守卫 的生命伤害事件结束"),
    "red5": find_step(10, "火球术 的生命伤害事件结束"),
    "lead": 300,
    "pressure": 330,
    "heal": find_step(13, "【圣光聚合体】essence → life"),
    "zero": 370,
    "final": 378,
}


def draw_life(draw, x, y, life, color, max_life=15):
    for i in range(max_life):
        xx = x + i * 22
        if i < life:
            draw.rounded_rectangle((xx, y, xx + 15, y + 30), radius=3, fill=(*rgb(color), 190), outline=(*rgb(color), 240))
        else:
            draw.rounded_rectangle((xx, y, xx + 15, y + 30), radius=3, outline=(*rgb(LINE), 180))


def player_panel(draw, snap, idx, box, deck_name, model, accent, label=None, max_life=15):
    x1, y1, x2, y2 = box
    p = snap["P"][idx]
    tag = label if label is not None else ("白方｜" if idx == 0 else "红方｜")
    draw.rounded_rectangle(box, radius=18, fill=(*rgb(PANEL), 240), outline=(*rgb(accent), 100), width=2)
    draw.text((x1 + 24, y1 + 18), tag + deck_name, font=fnt(29, True), fill=accent)
    draw.text((x1 + 25, y1 + 60), model, font=fnt(20), fill=MUTED)
    draw.text((x1 + 25, y1 + 96), f"灵体：{p['spiritName']}", font=fnt(17), fill=TEXT)
    draw.text((x2 - 35, y1 + 17), str(p["life"]), font=fnt(68, True), fill=accent, anchor="ra")
    draw.text((x2 - 35, y1 + 90), "剩余生命卡", font=fnt(17), fill=MUTED, anchor="ra")
    draw_life(draw, x1 + 25, y1 + 135, p["life"], accent, max_life)
    field = p["field"]
    start_x = x1 + 445
    draw.text((start_x, y1 + 18), f"战场 {len(field)}", font=fnt(18, True), fill=MUTED)
    if not field:
        draw.text((start_x, y1 + 65), "战场为空", font=fnt(20), fill=MUTED)
    for j, c in enumerate(field[:5]):
        bx = start_x + j * 190
        stats = f"{c.get('atk', 0)} 攻｜{c.get('imp', 0)} 冲｜{c.get('hp', 0)} 生"
        card_tile(draw, (bx, y1 + 50, bx + 175, y1 + 145), c["name"], c["color"], stats, c.get("tapped", False), True)
    draw.text((start_x, y1 + 164), f"灵质 {len(p['essence'])}｜主卡组 {p['deck']}｜手牌 {p['handCount']}｜分解 {len(p['grave'])}", font=fnt(17), fill=MUTED)


def life_chart(draw, current, box=(120, 785, 1800, 855), match=None, max_life=15, colors=None):
    m = match or MATCH
    x1, y1, x2, y2 = box
    draw.line((x1, y2, x2, y2), fill=(*rgb(LINE), 180), width=1)
    n = len(m["steps"])
    for idx, color in (colors or [(0, WHITE), (1, RED)]):
        pts = []
        for i in range(0, n, 3):
            p = m["steps"][i]["snap"]["P"][idx]["life"]
            x = x1 + (x2 - x1) * i / (n - 1)
            y = y2 - (y2 - y1) * p / max_life
            pts.append((x, y))
        if len(pts) > 1:
            draw.line(pts, fill=color, width=3)
    x = x1 + (x2 - x1) * current / (n - 1)
    draw.line((x, y1 - 5, x, y2 + 5), fill=GOLD, width=2)


def match_content(scene, step_idx):
    img = BASE_RED.copy()
    header(img, f"对局解说｜长局模式｜回合 {MATCH['steps'][step_idx]['snap']['turn']}", scene.get("num"))
    d = ImageDraw.Draw(img, "RGBA")
    snap = MATCH["steps"][step_idx]["snap"]
    player_panel(d, snap, 1, (80, 130, 1840, 345), "血燃献祭", "GLM 5.3 Flash", RED)
    player_panel(d, snap, 0, (80, 535, 1840, 750), "不落圣所", "DeepSeek V4.1 Flash", WHITE)
    d.rounded_rectangle((80, 365, 1840, 515), radius=16, fill=(*rgb(PANEL2), 235), outline=(*rgb(GOLD), 80))
    d.text((110, 385), scene["event"], font=fnt(25, True), fill=GOLD)
    event_text = MATCH["steps"][step_idx]["text"].strip().split("\n")[-1]
    text_block(d, (110, 435), event_text, fnt(22), TEXT, 1660, 7, 2)
    life_chart(d, step_idx)
    subtitle(img, scene["narration"])
    return img


def match_title_content(scene):
    img = BASE_RED.copy()
    header(img, "高质量对局解说｜长局模式", 1)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((960, 160), "落后七张生命，如何翻盘？", font=fnt(62, True), fill=TEXT, anchor="mm")
    d.text((960, 240), "7:14  →  5:4  →  2:4  →  3:0", font=fnt(42, True), fill=GOLD, anchor="mm")
    d.rounded_rectangle((130, 330, 900, 670), radius=24, fill=(*rgb(WHITE), 15), outline=(*rgb(WHITE), 140), width=2)
    d.text((515, 390), "白方｜不落圣所", font=fnt(43, True), fill=WHITE, anchor="mm")
    d.text((515, 465), "DeepSeek V4.1 Flash", font=fnt(30), fill=TEXT, anchor="mm")
    d.text((515, 550), "守护 · 自愈 · 反击", font=fnt(26), fill=MUTED, anchor="mm")
    d.rounded_rectangle((1020, 330, 1790, 670), radius=24, fill=(*rgb(RED), 15), outline=(*rgb(RED), 140), width=2)
    d.text((1405, 390), "红方｜血燃献祭", font=fnt(43, True), fill=RED, anchor="mm")
    d.text((1405, 465), "GLM 5.3 Flash", font=fnt(30), fill=TEXT, anchor="mm")
    d.text((1405, 550), "低费 · 临时强化 · 直伤", font=fnt(26), fill=MUTED, anchor="mm")
    d.text((960, 755), "长局模式｜15 生命｜5 起手｜双方合计 13 个回合", font=fnt(28), fill=TEXT, anchor="mm")
    d.text((960, 810), "真实引擎回放｜种子 20261517", font=fnt(21), fill=MUTED, anchor="mm")
    subtitle(img, scene["narration"])
    return img


def review_content(scene):
    img = BASE_RED.copy()
    header(img, "复盘｜三个环节共同完成翻盘", scene.get("num"))
    d = ImageDraw.Draw(img, "RGBA")
    d.text((960, 150), "最终剩余生命：白方 3｜红方 0", font=fnt(48, True), fill=GOLD, anchor="mm")
    d.rounded_rectangle((100, 235, 1820, 535), radius=20, fill=(*rgb(PANEL), 230))
    life_chart(d, 378, (150, 275, 1770, 480))
    d.text((150, 495), "白方生命", font=fnt(18), fill=WHITE)
    d.text((330, 495), "红方生命", font=fnt(18), fill=RED)
    items = [
        ("① 守卫轮流攻击", "两张巨石守卫与圣所守卫\n单回合合计七点", WHITE),
        ("② 雷铸强化", "其中一张 2 → 3 冲击\n完成首次反超", GOLD),
        ("③ 生命补给", "誓约之环＋质密发动\n生命 2 → 3", GREEN),
    ]
    for i, (title, body, color) in enumerate(items):
        x = 100 + i * 580
        d.rounded_rectangle((x, 590, x + 530, 815), radius=20, fill=(*rgb(color), 14), outline=(*rgb(color), 110))
        d.text((x + 30, 620), title, font=fnt(32, True), fill=color)
        d.multiline_text((x + 30, 690), body, font=fnt(25), fill=TEXT, spacing=14)
    subtitle(img, scene["narration"])
    return img


def glossary_content(scene):
    img = BASE_RED.copy()
    header(img, "对局词条速览｜先看懂，再看翻盘", 3)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((100, 140), "本局实际用到的六个规则概念", font=fnt(45, True), fill=TEXT)
    terms = [
        ("冲击力", "攻击未被阻挡时，以冲击力削减生命卡组。", GOLD),
        ("MT｜混合触发", "同时具有 LT 生命触发与 ST 能力触发；从生命揭示时按 MT 一侧结算。", GREEN),
        ("CT｜暴击触发", "生命揭示时为当前伤害事件追加 1 点；每个事件最多追加 1 点。", RED),
        ("回响", "在战场上生效；己方灵像被破坏时触发。", WHITE),
        ("质密", "只有这张卡位于灵质区时，才能使用或生效的能力。", GOLD),
        ("连锁", "效果与触发加入连锁后，逆序结算；状态检查随后处理破坏。", GREEN),
    ]
    for i, (name, body, color) in enumerate(terms):
        x = 100 + (i % 3) * 580
        y = 245 + (i // 3) * 285
        d.rounded_rectangle((x, y, x + 535, y + 245), radius=20, fill=(*rgb(color), 13), outline=(*rgb(color), 105))
        d.text((x + 28, y + 25), name, font=fnt(30, True), fill=color)
        text_block(d, (x + 28, y + 88), body, fnt(23), TEXT, 480, 12, 4)
    d.text((960, 835), "本局两次 CT 都来自生命揭示：圣光战将、地狱犬。", font=fnt(24, True), fill=RED, anchor="mm")
    subtitle(img, scene["narration"])
    return img


def gallery_content(scene):
    img = BASE_RED.copy()
    header(img, scene["title"], scene["num"])
    d = ImageDraw.Draw(img, "RGBA")
    cards = scene["cards"]
    four = len(cards) == 4
    for i, c in enumerate(cards):
        if four:
            x = 90 + (i % 2) * 880
            y = 135 + (i // 2) * 365
            w, h = 840, 350
        else:
            x = 90 + i * 590
            y, w, h = 160, 550, 625
        color = COLORS.get(c["color"], GOLD)
        d.rounded_rectangle((x, y, x + w, y + h), radius=20, fill=(*rgb(PANEL), 244), outline=(*rgb(color), 135), width=2)
        d.rectangle((x, y, x + 8, y + h), fill=color)
        d.text((x + 30, y + 22), c["name"], font=fnt(35 if four else 39, True), fill=color)
        d.text((x + 30, y + 72), c["meta"], font=fnt(19 if four else 21), fill=MUTED)
        if four:
            cy = y + 106
            if c.get("stats"):
                d.text((x + 30, cy), c["stats"], font=fnt(21, True), fill=TEXT)
                cy += 32
            if c.get("keywords"):
                d.text((x + 30, cy), "词条｜" + c["keywords"], font=fnt(19, True), fill=GOLD)
                cy += 30
            cy += 8
            d.text((x + 30, cy), "卡面效果", font=fnt(17, True), fill=MUTED)
            cy += 26
            text_block(d, (x + 30, cy), c["text"], fnt(18), TEXT, w - 60, 5, 4)
            text_block(d, (x + 30, y + 300), c["note"], fnt(16), color, w - 60, 3, 2)
            continue
        if c.get("stats"):
            d.text((x + 30, y + 112), c["stats"], font=fnt(22, True), fill=TEXT)
        if c.get("keywords"):
            d.text((x + 30, y + 151), "词条｜" + c["keywords"], font=fnt(20, True), fill=GOLD)
        ty = y + 210
        d.text((x + 30, ty), "卡面效果", font=fnt(19, True), fill=MUTED)
        text_block(d, (x + 30, ty + 36), c["text"], fnt(24), TEXT, w - 60, 9, 5)
        d.rounded_rectangle((x + 24, y + 505, x + w - 24, y + 595), radius=14, fill=(*rgb(color), 16))
        text_block(d, (x + 42, y + 526), c["note"], fnt(22), color, w - 84, 9, 3)
    subtitle(img, scene["narration"])
    return img


def trigger_content(scene, stage):
    img = BASE_RED.copy()
    header(img, scene["title"], scene["num"])
    d = ImageDraw.Draw(img, "RGBA")
    for i, label in enumerate(scene["labels"]):
        x = 140 + i * 570
        active = i == stage
        chip(d, (x, 145, x + 480, 215), f"{i + 1}｜{label}", scene["color"] if active else MUTED, 25)
        if i < 2:
            d.text((x + 525, 180), "→", font=fnt(30), fill=MUTED, anchor="mm")
    current = scene["stages"][stage]
    d.text((960, 290), current["title"], font=fnt(49, True), fill=scene["color"], anchor="mm")
    d.text((960, 355), current["subtitle"], font=fnt(27), fill=TEXT, anchor="mm")
    cards = current["cards"]
    total_w = len(cards) * 390 + (len(cards) - 1) * 90
    start_x = (W - total_w) / 2
    for i, c in enumerate(cards):
        x = start_x + i * 480
        d.rounded_rectangle((x, 440, x + 390, 655), radius=20, fill=(*rgb(PANEL2), 240), outline=(*rgb(scene["color"]), 150), width=2)
        d.text((x + 195, 485), c[0], font=fnt(31, True), fill=scene["color"], anchor="mm")
        text_block(d, (x + 195, 540), c[1], fnt(23), TEXT, 340, 10, 4, anchor="ma")
        if i < len(cards) - 1:
            d.text((x + 435, 548), "→", font=fnt(42), fill=GOLD, anchor="mm")
    if current.get("formula"):
        d.text((960, 730), current["formula"], font=fnt(47, True), fill=GOLD, anchor="mm")
    d.rounded_rectangle((250, 792, 1670, 855), radius=14, fill=(*rgb(PANEL), 230))
    d.text((960, 823), "引擎日志｜" + current["log"], font=fnt(22), fill=MUTED, anchor="mm")
    subtitle(img, scene["narration"])
    return img


VIDEO2 = [
    {"kind": "match_title", "num": 1, "min": 10, "narration": "最多落后七张生命，最后守住三张完成翻盘。白方不落圣所，由 DeepSeek V4.1 Flash 操作；红方血燃献祭，由 GLM 5.3 Flash 操作。"},
    {"kind": "match", "num": 2, "min": 11, "event": "对阵思路｜持久站场对快速削生命", "steps": [ST["start"]], "narration": "白方依靠守卫与恢复打持久战；红方用低费灵像、临时强化和直接伤害抢速度。长局模式双方各十五张生命，节奏更慢，容错也更高。"},
    {"kind": "match", "num": 3, "min": 19, "event": "红方先声夺人｜低费快攻，生命触发反制", "steps": [ST["start"], ST["bird"]], "narration": "火焰鸟第一次攻击造成两点生命伤害；血怒再把它推到三点，白方生命从十五张降到十张。第二次攻击揭示的雷霆打击带着 MT，把火焰鸟破坏，红方的第一波攻势就此中断。"},
    {"kind": "match", "num": 4, "min": 14, "event": "最大生命差｜火球术与暴击", "steps": [ST["bird"], ST["deficit"]], "narration": "两张守卫已经站住，红方改用火球术直接削减生命；生命卡圣光战将触发暴击，同一伤害事件追加一点。白方只剩七张生命，红方仍有十四张，差距来到全场最大。"},
    {"kind": "match", "num": 5, "min": 12, "event": "守卫站场｜白方开始持续反击", "steps": [ST["deficit"], ST["guard"], ST["red5"]], "narration": "白方依靠巨石守卫与圣所守卫连续反击，先把红方削到十一张。红方再以火球术把白方压到五张，双方都在争取最后的攻击窗口。"},
    {"kind": "match", "num": 6, "min": 16, "event": "首次反超｜三张灵像，七点冲击", "steps": [ST["red5"], ST["lead"]], "narration": "关键时刻，雷铸天兵把巨石守卫从两点冲击提高到三点。这一回合白方三张灵像依次攻击：三点、两点、一点；第一击揭示的地狱犬又触发暴击，追加一点。合计七点，红方从十一张跌到四张，白方首次以五比四反超。"},
    {"kind": "match", "num": 7, "min": 16, "event": "红方最后压制｜焚尽与生命触发", "steps": [ST["lead"], ST["pressure"]], "narration": "红方用焚尽继续抢血。生命触发同时改变场面：圣光打击的 MT 破坏了白方守卫，誓约之环的回响补入一张生命。全部结算后，白方只剩两张生命，红方还有四张，胜负再次倾向红方。"},
    {"kind": "match", "num": 8, "min": 12, "event": "最后准备｜圣光聚合体从灵质转入生命", "steps": [ST["pressure"], ST["heal"]], "narration": "白方先把圣光聚合体从灵质区放进生命卡组，生命从两张回到三张。"},
    {"kind": "match", "num": 9, "min": 21, "event": "终局｜生命卡组为空后，仍须继续结算伤害", "steps": [ST["heal"], ST["zero"], ST["final"]], "narration": "巨石守卫以三点冲击力攻击；地狱犬的暴击再追加一点，红方仅剩的四张生命全部揭示。生命卡组空了，比赛还没有结束。第二次攻击来自另一张巨石守卫，只有两点冲击；这一次伤害无法结算，胜负才确定。"},
    {"kind": "review", "num": 10, "min": 13, "narration": "这次翻盘由三个环节共同完成：两张守卫轮流攻击，雷铸天兵把其中一张的冲击从两点提到三点，誓约之环与圣光聚合体又把生命从两张补到三张。白方不是在生命领先时获胜，而是在最后一次攻击里，让红方先走到无法继续结算的那一步。"},
]

GLOSSARY_SCENE = {
    "kind": "glossary", "num": 3, "min": 22,
    "narration": "先看懂本局的六个概念。冲击力决定未被阻挡时削减多少生命。MT 是混合触发，同时具有生命触发与能力触发两种条件；CT 是暴击触发，为当前伤害事件追加一点，每个事件最多一次。回响要在战场上才生效；质密则只有卡在灵质区时才能使用。这些效果都要经过连锁与状态检查完成结算。",
}
EARLY_CARDS_SCENE = {
    "kind": "gallery", "num": 4, "min": 22, "title": "卡牌效果①｜火焰鸟为什么能连续提高冲击？",
    "narration": "火焰鸟本身只有一点冲击，词条是敏捷与威慑。真正让它提高输出的是余烬执火者和血怒：灵体横置提供一千攻击与一点冲击，血怒对未受伤的火焰鸟再提供一千攻击与一点冲击。",
    "cards": [
        {"name":"火焰鸟","meta":"1 费·红｜灵像","stats":"1000 攻｜1 冲｜1000 生","keywords":"敏捷·威慑","color":"红","text":"无额外效果文本。","note":"基础冲击只有 1；本局依靠灵体与血怒强化。"},
        {"name":"余烬执火者","meta":"红｜灵体专属能力","stats":"","keywords":"横置发动","color":"红","text":"横置：自己场上 1 张灵像获得 +1000 攻击力、+1 冲击力直到回合结束。","note":"多次横置，持续提高火焰鸟的攻击与冲击。"},
        {"name":"血怒","meta":"2 费·红｜灵感","stats":"","keywords":"无","color":"红","text":"自己场上 1 张灵像获得 +1000 攻击力、+1 冲击力；若已受伤，改为 +2000 攻击力、+1 冲击力。","note":"火焰鸟未受伤，本局 +1000 攻、+1 冲。"},
    ],
}
MT_SCENE = {
    "kind": "trigger", "num": 6, "min": 19, "title": "触发展示①｜雷霆打击 MT", "color": GREEN,
    "labels": ["生命揭示", "加入连锁", "伤害与破坏"],
    "narration": "雷霆打击是 MT 混合触发。它从生命卡组被揭示后，不是直接进入分解区就结束，而是先加入连锁；结算时对场上灵像造成两千点伤害。火焰鸟只有一千生命，状态检查随即将它破坏。",
    "stages": [
        {"title":"生命卡被揭示","subtitle":"雷霆打击带有 MT，混合触发条件成立","cards":[("生命卡组","顶卡被揭示"),("雷霆打击","MT｜混合触发")],"log":"生命揭示【雷霆打击】"},
        {"title":"先进入连锁","subtitle":"效果尚未结算，先按连锁顺序等待处理","cards":[("雷霆打击","MT 触发加入连锁"),("连锁区","等待双方让过")],"log":"【雷霆打击】MT 触发加入连锁"},
        {"title":"效果结算，再检查状态","subtitle":"2000 伤害超过火焰鸟的 1000 生命","cards":[("火焰鸟","1000 生命"),("受到 2000","状态检查破坏")],"formula":"2000 伤害  ≥  1000 生命","log":"【火焰鸟】field → grave"},
    ],
}
CT_SCENE = {
    "kind": "trigger", "num": 8, "min": 18, "title": "触发展示②｜圣光战将 CT 暴击", "color": RED,
    "labels": ["原伤害事件", "CT 加入连锁", "追加伤害"],
    "narration": "火球术原本造成两点生命伤害。圣光战将从生命里被揭示，并没有进场，卡面的序曲不会发动；此时发动的是 CT 暴击。暴击为同一个伤害事件追加一点，所以这次共揭示三张生命；同一事件后续再有暴击，也不能重复追加。",
    "stages": [
        {"title":"先确定原伤害","subtitle":"火球术对对手灵体造成 2 点伤害","cards":[("火球术","3 费·红｜灵感"),("生命伤害","原事件＝2 点")],"log":"【火球术】造成 2 点生命伤害"},
        {"title":"生命揭示 CT 卡","subtitle":"它没有进场，序曲不发动；发动的是 CT 暴击","cards":[("圣光战将","CT｜暴击触发"),("连锁区","暴击触发加入连锁")],"log":"【圣光战将】CT 触发加入连锁"},
        {"title":"同一事件追加 1 点","subtitle":"不是另开伤害事件，也不能无限叠加","cards":[("原伤害","2 点"),("暴击追加","+1 点")],"formula":"2  +  1  =  3 张生命","log":"本伤害事件追加 1 点（已达每段上限）"},
    ],
}
WHITE_CARDS_SCENE = {
    "kind": "gallery", "num": 10, "min": 23, "title": "卡牌效果②｜白方反击的四张关键牌",
    "narration": "白方的反击并不只靠大身材。巨石守卫提供稳定冲击，圣所守卫补充站场；雷铸天兵从手牌使用时，按卡面效果增加一千攻击与一点冲击。誓约之环则是回响，它不负责强化，而是在己方灵像被破坏时补生命。",
    "cards": [
        {"name":"巨石守卫","meta":"5 费·灰｜灵像","stats":"5000 攻｜2 冲｜5000 生","keywords":"无","color":"灰","text":"无额外效果文本。","note":"稳定 2 冲击；强化后变为 3。"},
        {"name":"圣所守卫","meta":"4 费·白｜灵像","stats":"3000 攻｜1 冲｜4000 生","keywords":"守护·灵气","color":"白","text":"无额外效果文本。","note":"本局提供 1 冲击与站场。"},
        {"name":"雷铸天兵","meta":"2 费·黄｜灵感","stats":"","keywords":"CT（生命揭示时为暴击）","color":"黄","text":"自己场上 1 张灵像获得 +1000 攻击力、+1 冲击力。","note":"本局从手牌使用：巨石守卫 5000→6000 攻、2→3 冲。"},
        {"name":"誓约之环","meta":"2 费·白｜灵性","stats":"2000 生","keywords":"回响","color":"白","text":"自己场上的灵像被破坏时，可将主卡组顶部 1 张置于生命卡组顶部（每回合 1 次）。","note":"不加攻击；负责条件满足后的生命补给。"},
    ],
}
PRESSURE_CARDS_SCENE = {
    "kind": "gallery", "num": 12, "min": 23, "title": "卡牌效果③｜最后压制与生命补给",
    "narration": "红方战场为空，所以焚尽按卡面改为四点伤害。白方的圣光打击以 MT 从生命触发，三千点伤害打在自家已受伤的圣所守卫身上；治愈灵光不是自行触发，而是被誓约之环从主卡组顶送入生命。最后，圣光聚合体以质密横置发动，把自己放进生命卡组。",
    "cards": [
        {"name":"焚尽","meta":"5 费·红｜灵感","stats":"","keywords":"无","color":"红","text":"对对手灵体造成 3 点伤害；若自己场上没有灵像，改为 4 点。","note":"红方战场为空，本局造成 4 点。"},
        {"name":"圣光打击","meta":"2 费·白｜灵感","stats":"","keywords":"MT｜混合触发","color":"白","text":"对场上 1 张灵像造成 5000 点伤害。\nMT（生命揭示）：对场上 1 张灵像造成 3000 点伤害。","note":"本局以 MT 触发，命中白方自己已受伤的圣所守卫。"},
        {"name":"治愈灵光","meta":"2 费·白｜灵感","stats":"","keywords":"无","color":"白","text":"将主卡组顶部 1 张置于生命卡组顶部。","note":"本局由誓约之环移入生命，并非主动使用。"},
        {"name":"圣光聚合体","meta":"1 费·白｜灵像","stats":"500 攻｜1 冲｜500 生","keywords":"质密","color":"白","text":"质密·横置发动：将本卡置于自己生命卡组顶部。","note":"从灵质区发动，生命由 2 回到 3。"},
    ],
}
RING_SCENE = {
    "kind": "trigger", "num": 14, "min": 21, "title": "触发展示③｜圣光打击 MT × 誓约之环回响", "color": WHITE,
    "labels": ["MT 破坏守卫", "回响条件成立", "补入一张生命"],
    "narration": "这一段有两条不同的触发。圣光打击以 MT 命中白方自己的圣所守卫——它先前已经受过三千点伤害，这次再受三千，累计超过四千生命，状态检查将其破坏。誓约之环的回响因此条件成立，把主卡组顶的治愈灵光放到生命卡组顶。真正补回生命的是誓约之环。",
    "stages": [
        {"title":"圣光打击 MT 结算","subtitle":"先前已受 3000，再受 3000，累计 6000／4000","cards":[("圣光打击","MT｜3000 伤害"),("圣所守卫","3000＋3000 → 破坏")],"log":"【圣所守卫】被状态检查破坏"},
        {"title":"誓约之环条件成立","subtitle":"自己场上的灵像被破坏 → 触发回响","cards":[("破坏事件","圣所守卫离场"),("誓约之环","回响触发")],"log":"己方灵像被破坏，回响条件成立"},
        {"title":"主卡组顶转入生命","subtitle":"移动的是治愈灵光，但效果来源是誓约之环","cards":[("主卡组顶","治愈灵光"),("生命卡组","补充 1 张")],"formula":"5 − 4 + 1  =  2 张生命","log":"【治愈灵光】deck → life"},
    ],
}
FINAL_TRIGGER_SCENE = {
    "kind": "trigger", "num": 16, "min": 19, "title": "触发展示④｜地狱犬 CT 与终局", "color": RED,
    "labels": ["强化后的冲击", "地狱犬暴击", "第二次攻击"],
    "narration": "雷铸天兵已经把巨石守卫提高到三点冲击。第一次攻击揭示地狱犬，它的 CT 暴击再追加一点，红方仅剩的四张生命全部揭示。生命卡组空了，比赛还没有结束；第二次攻击来自另一张巨石守卫，只有两点冲击，这一次伤害无法结算，红方才落败。",
    "stages": [
        {"title":"巨石守卫发起攻击","subtitle":"雷铸天兵已提供 +1000 攻、+1 冲","cards":[("巨石守卫","原冲击 2"),("雷铸天兵","强化后冲击 3")],"log":"攻击未被阻挡，以 3 点冲击力造成伤害"},
        {"title":"地狱犬 CT 暴击","subtitle":"同一伤害事件追加 1 点","cards":[("当前事件","3 点生命伤害"),("地狱犬","CT｜追加 1 点")],"formula":"3  +  1  =  4 张生命","log":"本伤害事件追加 1 点（已达每段上限）"},
        {"title":"第二张巨石守卫攻击","subtitle":"只有 2 点冲击，但生命卡组已经为空","cards":[("红方生命","0 张"),("继续伤害","无法结算 → 落败")],"formula":"0 张生命  +  仍需伤害  =  落败","log":"生命卡组为空且仍需结算生命伤害"},
    ],
}

VIDEO2 = [
    VIDEO2[0], VIDEO2[1], GLOSSARY_SCENE, EARLY_CARDS_SCENE,
    dict(VIDEO2[2], num=5, min=13, narration="火焰鸟第一次攻击造成两点生命伤害；血怒把它推到三点，白方生命从十五张降到十张。第二次攻击中的雷霆打击 MT，则中断了这波攻势。"),
    MT_SCENE,
    dict(VIDEO2[3], num=7, min=12),
    CT_SCENE,
    dict(VIDEO2[4], num=9, min=11),
    WHITE_CARDS_SCENE,
    dict(VIDEO2[5], num=11, min=14, event="首次反超｜雷铸天兵强化冲击", narration="关键时刻，雷铸天兵把巨石守卫从两点冲击提高到三点。三张灵像依次攻击，第一击揭示的地狱犬又触发暴击，合计七点，红方从十一张跌到四张，白方首次以五比四反超。"),
    PRESSURE_CARDS_SCENE,
    dict(VIDEO2[6], num=13, min=13, narration="红方用焚尽继续抢血。圣光打击的 MT 破坏了白方守卫，誓约之环的回响随后补入一张生命。全部结算后，白方只剩两张，红方还有四张。"),
    RING_SCENE,
    dict(VIDEO2[7], num=15, min=11),
    FINAL_TRIGGER_SCENE,
    dict(VIDEO2[8], num=17, min=17, narration="巨石守卫以三点冲击力攻击，地狱犬的暴击追加一点，红方四张生命全部揭示。第二张巨石守卫紧跟着攻击，只有两点冲击；这一次伤害无法结算，胜负才确定。"),
    dict(VIDEO2[9], num=18, min=14, narration="这次翻盘由三个环节共同完成：两张守卫轮流攻击，雷铸天兵把其中一张的冲击从两点提到三点，誓约之环与圣光聚合体又把生命从两张补到三张。白方不是在生命领先时获胜，而是在最后一次攻击里，让红方先走到无法继续结算的那一步。"),
]

# ---------------------------------------------------------------- 视频 3：标准模式
MAXLIFE3 = 10
CFG3 = MATCH3["config"]


def find3(turn, contains, occurrence=0, after=0):
    found = [i for i, step in enumerate(MATCH3["steps"])
             if i >= after and step["snap"]["turn"] == turn and contains in step["text"]]
    if not found:
        raise ValueError((turn, contains, occurrence))
    return found[min(occurrence, len(found) - 1)]


ST3 = {
    "start": 0,
    "open": find3(1, "将 1 张手牌置于灵质区"),
    "first": find3(5, "幼苗守望者 的生命伤害事件结束"),
    "dog2": find3(6, "地狱犬 的生命伤害事件结束"),
    "elephant": find3(7, "幼苗守望者 的生命伤害事件结束"),
    "dog3": find3(8, "地狱犬 的生命伤害事件结束"),
    "ram": find3(10, "碾压"),
    "twin": find3(11, "森林战将 的生命伤害事件结束"),
    "mt": find3(12, "受到 3000 点伤害（圣光打击）"),
    "fire": find3(12, "火球术 的生命伤害事件结束"),
    "final": find3(13, "落败"),
}


def match3_content(scene, step_idx):
    img = BASE_RED.copy()
    snap = MATCH3["steps"][step_idx]["snap"]
    header(img, f"对局解说｜标准模式｜回合 {snap['turn']}", scene.get("num"))
    d = ImageDraw.Draw(img, "RGBA")
    player_panel(d, snap, 1, (80, 130, 1840, 345), CFG3["deckNameB"], CFG3["nameB"], GREEN, "绿方｜", MAXLIFE3)
    player_panel(d, snap, 0, (80, 535, 1840, 750), CFG3["deckNameA"], CFG3["nameA"], RED, "红方｜", MAXLIFE3)
    d.rounded_rectangle((80, 365, 1840, 515), radius=16, fill=(*rgb(PANEL2), 235), outline=(*rgb(GOLD), 80))
    d.text((110, 385), scene["event"], font=fnt(25, True), fill=GOLD)
    event_text = scene.get("detail") or MATCH3["steps"][step_idx]["text"].strip().split("\n")[-1]
    text_block(d, (110, 435), event_text, fnt(22), TEXT, 1660, 7, 2)
    life_chart(d, step_idx, (120, 785, 1800, 855), MATCH3, MAXLIFE3, [(0, RED), (1, GREEN)])
    subtitle(img, scene["narration"])
    return img


def match3_title_content(scene):
    img = BASE_RED.copy()
    header(img, "高质量对局解说｜标准模式", 1)
    d = ImageDraw.Draw(img, "RGBA")
    d.text((960, 160), "十张生命，十三回合", font=fnt(62, True), fill=TEXT, anchor="mm")
    d.text((960, 240), "10 : 10  →  8 : 6  →  3 : 1  →  1 : 1  →  1 : 0", font=fnt(40, True), fill=GOLD, anchor="mm")
    d.text((960, 292), "比分按 绿 ： 红", font=fnt(21), fill=MUTED, anchor="mm")
    d.rounded_rectangle((130, 330, 900, 670), radius=24, fill=(*rgb(GREEN), 15), outline=(*rgb(GREEN), 140), width=2)
    d.text((515, 390), "绿方｜根脉奔流", font=fnt(42, True), fill=GREEN, anchor="mm")
    d.text((515, 465), "GLM5.3", font=fnt(30), fill=TEXT, anchor="mm")
    d.text((515, 550), "跳费 · 巨象 · 碾压", font=fnt(26), fill=MUTED, anchor="mm")
    d.rounded_rectangle((1020, 330, 1790, 670), radius=24, fill=(*rgb(RED), 15), outline=(*rgb(RED), 140), width=2)
    d.text((1405, 390), "红方｜赤蓝燃穿", font=fnt(42, True), fill=RED, anchor="mm")
    d.text((1405, 465), "KIMI 3.1pro", font=fnt(30), fill=TEXT, anchor="mm")
    d.text((1405, 550), "低费 · 暴击指示物 · 直伤", font=fnt(26), fill=MUTED, anchor="mm")
    d.text((960, 745), "标准模式｜10 生命｜4 起手｜双方各 50 张，同色均为 68%", font=fnt(28), fill=TEXT, anchor="mm")
    d.text((960, 805), "真实引擎回放｜种子 20300709", font=fnt(21), fill=MUTED, anchor="mm")
    subtitle(img, scene["narration"])
    return img


def review3_content(scene):
    img = BASE_RED.copy()
    header(img, "复盘｜三个环节共同决定胜负", scene.get("num"))
    d = ImageDraw.Draw(img, "RGBA")
    d.text((960, 150), "最终剩余生命：绿方 1｜红方 0", font=fnt(48, True), fill=GOLD, anchor="mm")
    d.rounded_rectangle((100, 235, 1820, 535), radius=20, fill=(*rgb(PANEL), 230))
    life_chart(d, len(MATCH3["steps"]) - 1, (150, 275, 1770, 480), MATCH3, MAXLIFE3, [(0, RED), (1, GREEN)])
    d.text((150, 495), "红方生命", font=fnt(18), fill=RED)
    d.text((330, 495), "绿方生命", font=fnt(18), fill=GREEN)
    items = [
        ("① 灵质先起步", "第一回合就多置一张\n第五回合 7 比 2", GREEN),
        ("② 碾压拒绝交换", "一千与两千点解牌\n全部被挡在 7000 之外", GOLD),
        ("③ 红方的天花板", "每回合稳定两点\n地狱犬一倒就断档", RED),
    ]
    for i, (title, body, color) in enumerate(items):
        x = 100 + i * 580
        d.rounded_rectangle((x, 590, x + 530, 815), radius=20, fill=(*rgb(color), 14), outline=(*rgb(color), 110))
        d.text((x + 30, 620), title, font=fnt(31, True), fill=color)
        d.multiline_text((x + 30, 690), body, font=fnt(25), fill=TEXT, spacing=14)
    subtitle(img, scene["narration"])
    return img


def closing3_content(scene):
    img = BASE_RED.copy()
    header(img, "结语", scene.get("num"))
    d = ImageDraw.Draw(img, "RGBA")
    d.text((960, 230), "同一条六成线，两种解法", font=fnt(60, True), fill=GOLD, anchor="mm")
    metric(d, 200, 420, 440, "68%", "双方同色比例", GREEN)
    metric(d, 740, 420, 440, "13", "回合数", GOLD)
    metric(d, 1280, 420, 440, "1 : 0", "终局生命（绿／红）", GREEN)
    d.text((960, 690), "同色规则收紧的是配比，不是打法。", font=fnt(44, True), fill=TEXT, anchor="mm")
    d.text((960, 780), "下一局，换一套卡组再来。", font=fnt(30), fill=MUTED, anchor="mm")
    subtitle(img, scene["narration"])
    return img


def glossary3_content(scene):
    img = BASE_RED.copy()
    header(img, scene["title"], scene.get("num"))
    d = ImageDraw.Draw(img, "RGBA")
    for i, (name, body, color) in enumerate(scene["terms"]):
        x = 100 + (i % 3) * 580
        y = 160 + (i // 3) * 320
        d.rounded_rectangle((x, y, x + 535, y + 285), radius=20, fill=(*rgb(color), 13), outline=(*rgb(color), 105))
        d.text((x + 28, y + 24), name, font=fnt(31, True), fill=color)
        text_block(d, (x + 28, y + 96), body, fnt(26), TEXT, 480, 12, 5)
    subtitle(img, scene["narration"])
    return img


GLOSSARY3 = {
    "kind": "glossary3", "num": 5, "min": 22,
    "title": "本局词条｜先看懂这六个概念",
    "terms": [
        ("序曲", "从手牌使用时触发的能力。", GREEN),
        ("ST｜能力触发", "卡从主卡组顶被检视并揭示时，处理它写着的能力。", GOLD),
        ("CT｜暴击触发", "从生命卡组揭示时，为当前伤害事件追加 1 点；每个事件最多一次。", RED),
        ("暴击指示物", "灵体上的指示物。攻击时移除 1 个，本次 +1000 攻击、+1 冲击。", GOLD),
        ("碾压", "这一次伤害不足以破坏它时，伤害完全被防止。", GREEN),
        ("预制", "进场的当回合就可以宣告攻击。", MUTED),
    ],
    "narration": "先看懂这六个概念。序曲是从手牌使用时触发。ST 是卡从牌堆顶被揭示时处理的能力；CT 是从生命里揭示时为伤害事件追加一点。暴击指示物挂在灵体上，攻击时移除，换一千攻击与一点冲击。碾压只判断伤害够不够致命。预制让巨兽落地就能攻击。",
}

VIDEO3 = [
    {"kind": "match_title3", "num": 1, "min": 10,
     "narration": "同一条六成线，两种完全不同的解法。绿方用灵质跳费，红方用暴击指示物。十张生命，十三回合，比分一路咬到一比一，最后一个回合才分出胜负。"},
    {"kind": "match3", "num": 2, "min": 14, "event": "开局｜灵质从第一回合就开始拉差距", "steps": [ST3["start"], ST3["open"]],
     "detail": "GLM5.3 将 1 张手牌置于灵质区。\nGLM5.3 从主卡组抽 1 张。",
     "narration": "标准模式，双方各十张生命。绿方先手，第一回合就把一张手牌放进灵质区，再靠灵体能力多放一张、抽一张。到第五回合，绿方七张灵质，红方只有两张。"},
    {"kind": "match3", "num": 3, "min": 13, "event": "第一次伤害｜两费小生物先开口", "steps": [ST3["first"]],
     "detail": "KIMI 3.1pro 受到 1 点生命伤害（幼苗守望者），逐点处理。\n生命揭示【火球术】进入分解区。",
     "narration": "第五回合，绿方两费的幼苗守望者先动手。一点冲击力，红方生命从十张降到九张。这是全场第一次伤害。"},
    {"kind": "match3", "num": 4, "min": 14, "event": "红方反击｜地狱犬加暴击指示物", "steps": [ST3["dog2"]],
     "detail": "GLM5.3 受到 2 点生命伤害（地狱犬），逐点处理。\n生命揭示【藤蔓编织者】进入分解区。",
     "narration": "红方的反击来得很快。两费的地狱犬带预制，进场的当回合就能攻击；再叠上灵体给的暴击指示物，冲击力翻倍，绿方生命从十张掉到八张。"},
    GLOSSARY3,
    {"kind": "match3", "num": 6, "min": 15, "event": "巨象落地｜七费在第七回合打出", "steps": [ST3["elephant"]],
     "detail": "KIMI 3.1pro 受到 2 点生命伤害（王牌巨象），逐点处理。\nKIMI 3.1pro 受到 1 点生命伤害（幼苗守望者），逐点处理。",
     "narration": "第七回合，绿方打出七费的王牌巨象：五绿两灰。它带预制，落地就能攻击；冲击力两点，加上幼苗守望者的一点，红方一回合掉三点，从九张到六张。"},
    {"kind": "gallery", "num": 7, "min": 23, "title": "卡牌效果①｜七费的巨象为什么能提前落地？",
     "cards": [
         {"name": "根脉育苗者", "meta": "绿｜灵体专属能力", "stats": "", "keywords": "横置发动", "color": "绿",
          "text": "横置，将 1 张手牌置于灵质区：抽 1 张。", "note": "每回合多一张灵质，还补一张手牌。"},
         {"name": "自然生长", "meta": "2 费·绿｜灵感", "stats": "", "keywords": "无", "color": "绿",
          "text": "将主卡组顶部 1 张置于灵质区。", "note": "两费换一张灵质，本局打出两张。"},
         {"name": "王牌巨象", "meta": "7 费·绿｜灵像", "stats": "6000 攻｜2 冲｜7000 生", "keywords": "预制·碾压·践踏·超冲击", "color": "绿",
          "text": "无额外效果文本。", "note": "第七回合落地，当回合就能攻击。"},
     ],
     "narration": "灵体根脉育苗者横置一次，就把一张手牌置为灵质，再抽一张；自然生长两费，直接把牌库顶变成灵质。加上幼苗守望者的序曲，绿方每回合都在多放灵质。跳费两回合，七费巨象就能提前落地。"},
    {"kind": "match3", "num": 8, "min": 14, "event": "红方的解法｜先解节奏点，再补刀", "steps": [ST3["dog3"]],
     "detail": "【幼苗守望者】被状态检查破坏。\nGLM5.3 受到 2 点生命伤害（地狱犬），逐点处理。",
     "narration": "红方没有急着换巨象，先解掉绿方的节奏点：预案引燃两点伤害，打掉幼苗守望者；地狱犬再打两点，暴击指示物又追加一点。绿方从八张掉到五张。"},
    {"kind": "match3", "num": 9, "min": 14, "event": "巨象吃不掉｜两张解牌全部落空", "steps": [ST3["ram"]],
     "detail": "【王牌巨象】的碾压防止 1000 点非致命伤害。\n【王牌巨象】的碾压防止 2000 点非致命伤害。",
     "narration": "红方两张解牌一起指向巨象，全部无效。爆燃一千点，奥术飞弹两千点，都低于巨象的剩余生命——碾压把非致命伤害完全挡掉，巨象一点伤都没受。"},
    {"kind": "trigger", "num": 10, "min": 19, "title": "触发展示｜碾压为什么能挡住两张解牌", "color": GREEN,
     "labels": ["解牌指向巨象", "伤害低于剩余生命", "全部防止"],
     "narration": "碾压的判断只有一条：这次伤害能不能直接杀死它。伤害低于剩余生命，就完全不生效；达到或超过，才照常结算。所以一千点、两千点对一张七千生命的巨象，等于零。",
     "stages": [
         {"title": "解牌指向巨象", "subtitle": "爆燃 1 费、奥术飞弹 2 费，先加入连锁", "cards": [("爆燃", "1000 点伤害"), ("奥术飞弹", "2000 点伤害")], "log": "两张解牌依次加入连锁"},
         {"title": "逐段结算", "subtitle": "先结算爆燃，巨象满生命 7000", "cards": [("巨象生命", "7000"), ("本次伤害", "1000")], "log": "【王牌巨象】的碾压防止 1000 点非致命伤害。"},
         {"title": "第二段也被挡", "subtitle": "伤害仍然低于剩余生命", "cards": [("巨象生命", "7000"), ("本次伤害", "2000")], "formula": "1000 < 7000　2000 < 7000", "log": "【王牌巨象】的碾压防止 2000 点非致命伤害。"},
     ]},
    {"kind": "match3", "num": 11, "min": 14, "event": "第二张巨兽｜六费森林战将到场", "steps": [ST3["twin"]],
     "detail": "KIMI 3.1pro 受到 2 点生命伤害（王牌巨象），逐点处理。\nKIMI 3.1pro 受到 1 点生命伤害（森林战将），逐点处理。",
     "narration": "第十一回合，绿方的第二张巨兽也到了：六费的森林战将，同样带预制。巨象两点、战将一点，红方从四张被压到一张。"},
    {"kind": "gallery", "num": 12, "min": 21, "title": "卡牌效果②｜红方的输出只有两件东西",
     "cards": [
         {"name": "地狱犬", "meta": "2 费·红｜灵像", "stats": "2000 攻｜1 冲｜2500 生", "keywords": "预制·自愈 / CT", "color": "红",
          "text": "无额外效果文本。", "note": "本局唯一的稳定打手，每次两点。"},
         {"name": "火球术", "meta": "3 费·红｜灵感", "stats": "", "keywords": "无", "color": "红",
          "text": "对对手灵体造成 2 点伤害。", "note": "不经过战斗，直接削减生命。"},
         {"name": "预案引燃", "meta": "3 费·红｜灵感", "stats": "", "keywords": "无", "color": "红",
          "text": "抽 1 张；对对手场上 1 张灵像造成 2000 点伤害。", "note": "兼职解场，本局打掉幼苗守望者。"},
     ],
     "narration": "红方的输出全靠两件东西：地狱犬每回合稳定的两点冲击，和火球术、预案引燃这类直伤。效率很高，但天花板也清楚——每回合最多两点，而且都要经过地狱犬这只生物。"},
    {"kind": "match3", "num": 13, "min": 15, "event": "最后反击｜火球术压到一张，代价是引擎", "steps": [ST3["mt"], ST3["fire"]],
     "detail": "【地狱犬】被状态检查破坏。\nGLM5.3 受到 2 点生命伤害（火球术），逐点处理。",
     "narration": "第十二回合，红方用火球术把绿方压到一张生命。可就在同一段伤害里，绿方揭示了圣光打击——混合触发，三千点伤害直接打在地狱犬身上。"},
    {"kind": "trigger", "num": 14, "min": 19, "title": "触发展示｜圣光打击 MT 打在谁身上", "color": WHITE,
     "labels": ["火球术 2 点", "生命揭示 MT", "3000 点杀地狱犬"],
     "narration": "圣光打击从生命里被揭示，不会进场，序曲不发动；发动的是混合触发那一侧：对场上任意一张灵像造成三千点伤害。地狱犬只有两千五百生命，状态检查随即把它破坏。红方唯一的输出引擎，被自己的生命卡打掉。",
     "stages": [
         {"title": "先确定原伤害", "subtitle": "火球术对绿方灵体造成 2 点生命伤害", "cards": [("火球术", "3 费·红｜灵感"), ("生命伤害", "原事件＝2 点")], "log": "【火球术】造成 2 点生命伤害"},
         {"title": "生命揭示圣光打击", "subtitle": "MT＝同时具有 LT 与 ST；从生命揭示时按 MT 结算", "cards": [("圣光打击", "MT｜混合触发"), ("连锁区", "3000 点伤害待结算")], "log": "【圣光打击】MT 触发加入连锁"},
         {"title": "打掉地狱犬", "subtitle": "3000 超过 2500 生命，状态检查破坏", "cards": [("地狱犬", "2500 生命"), ("受到 3000", "field → grave")], "formula": "3000  ≥  2500", "log": "【地狱犬】被状态检查破坏"},
     ]},
    {"kind": "match3", "num": 15, "min": 14, "event": "终局｜生命卡组空了，还要把伤害结算完", "steps": [ST3["final"]],
     "detail": "KIMI 3.1pro 揭示生命卡【灰烬小僧】，待结算 1 点。\nKIMI 3.1pro 因「生命卡组为空且仍需结算生命伤害」落败。",
     "narration": "第十三回合，王牌巨象再一次攻击，两点冲击。红方只剩一张生命，揭示灰烬小僧之后，生命卡组空了，但这次伤害仍有一点没有结算——胜负就在这一点上确定。"},
    {"kind": "review3", "num": 16, "min": 16,
     "narration": "绿方赢在三件事：灵质从第一回合就开始跳，巨象因此提前两回合落地；碾压让红方的解牌全部作废；红方每回合两点伤害的天花板，撑不到巨象倒下。"},
    {"kind": "closing3", "num": 17, "min": 9,
     "narration": "两套五十张、同色都是六成八的卡组，用同一条构筑线，打出了两种完全不同的节奏。同色规则收紧的是配比，不是打法。"},
]

CONTENT_BUILDERS = {
    "title": title_content,
    "prototype": prototype_content,
    "rules": rules_content,
    "resource": resource_content,
    "combat": combat_content,
    "modes": modes_content,
    "first_set": first_set_content,
    "constraint": constraint_content,
    "engine": engine_content,
    "ai": ai_content,
    "results": results_content,
    "final": final_content,
    "match_title": match_title_content,
    "glossary": glossary_content,
    "gallery": gallery_content,
    "review": review_content,
    "match_title3": match3_title_content,
    "match3": match3_content,
    "review3": review3_content,
    "closing3": closing3_content,
    "glossary3": glossary3_content,
}


async def make_voice(text, path):
    if path.exists() and path.stat().st_size > 1000:
        return
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
    await communicate.save(str(path))


async def make_all_voices(scenes, prefix):
    sem = asyncio.Semaphore(3)
    async def one(i, scene):
        async with sem:
            await make_voice(scene["narration"], WORK / f"{prefix}-{i:02d}.mp3")
    await asyncio.gather(*(one(i, s) for i, s in enumerate(scenes)))


def decode_mp3(path):
    proc = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], check=True, capture_output=True)
    return np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def write_audio(scenes, prefix, starts, durations, total, match=False):
    n = round(total * SR)
    narration = np.zeros(n, dtype=np.float32)
    for i, scene in enumerate(scenes):
        audio = decode_mp3(WORK / f"{prefix}-{i:02d}.mp3")
        start = round((starts[i] + 0.3) * SR)
        end = min(n, start + len(audio))
        narration[start:end] += audio[:end - start]
    music = np.zeros(n, dtype=np.float32)
    chunk = SR * 8
    chords = [[110.0, 164.81, 220.0], [98.0, 146.83, 196.0], [123.47, 185.0, 246.94], [82.41, 123.47, 164.81]]
    for ci, start in enumerate(range(0, n, chunk)):
        end = min(n, start + chunk)
        t = np.arange(end - start, dtype=np.float32) / SR
        env = np.minimum(1, t / 1.2) * np.minimum(1, (end - start - np.arange(end - start)) / (SR * 1.5))
        pad = np.zeros_like(t)
        for j, freq in enumerate(chords[ci % len(chords)]):
            pad += np.sin(2 * np.pi * freq * t + j * .7) * (.34 / (j + 1))
            pad += np.sin(2 * np.pi * freq * 2 * t + j) * .06
        pulse = np.sin(2 * np.pi * (55 if match else 65.4) * t) * (np.maximum(0, np.sin(2 * np.pi * (1.5 if match else 1.0) * t)) ** 8) * .12
        music[start:end] = (pad + pulse) * env * (.052 if match else .045)
    fade = min(SR * 2, n // 2)
    music[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
    music[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    stereo = np.stack([narration + music, narration + music * .96], axis=1)
    peak = float(np.max(np.abs(stereo)))
    if peak > .96:
        stereo *= .96 / peak
    path = WORK / f"{prefix}-soundtrack.wav"
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((stereo * 32767).astype("<i2").tobytes())
    return path


def scene_frames(scene):
    if scene["kind"] == "match":
        return [match_content(scene, idx) for idx in scene["steps"]]
    if scene["kind"] == "match3":
        return [match3_content(scene, idx) for idx in scene["steps"]]
    if scene["kind"] == "trigger":
        return [trigger_content(scene, i) for i in range(len(scene["stages"]))]
    return [CONTENT_BUILDERS[scene["kind"]](scene)]


def render_video(scenes, prefix, output, cover=None):
    asyncio.run(make_all_voices(scenes, prefix))
    audio_lens = [MP3(WORK / f"{prefix}-{i:02d}.mp3").info.length for i in range(len(scenes))]
    durations = [max(s["min"], audio_lens[i] + 1.35) for i, s in enumerate(scenes)]
    durations = [math.ceil(d * FPS) / FPS for d in durations]
    starts, now = [], 0.0
    for d in durations:
        starts.append(now)
        now += d
    total = now
    print(prefix, "duration", round(total, 3), "scene durations", durations, flush=True)
    soundtrack = write_audio(scenes, prefix, starts, durations, total, prefix.startswith(("video2", "video3")))
    scene_imgs = [scene_frames(s) for s in scenes]
    if cover:
        scene_imgs[0][0].save(OUT / cover)
    cmd = [
        FFMPEG, "-y", "-v", "warning", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", str(soundtrack),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(output),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    global_frame = 0
    total_frames = round(total * FPS)
    for si, (scene, dur) in enumerate(zip(scenes, durations)):
        frames = round(dur * FPS)
        imgs = scene_imgs[si]
        for local in range(frames):
            p = local / max(1, frames - 1)
            pos = p * len(imgs)
            idx = min(len(imgs) - 1, int(pos))
            img = imgs[idx]
            if len(imgs) > 1 and scene["kind"] not in ("match", "trigger") and idx < len(imgs) - 1:
                frac = pos - idx
                if frac > .78:
                    a = ease((frac - .78) / .22)
                    img = Image.blend(img, imgs[idx + 1], a)
            frame = img.copy()
            d = ImageDraw.Draw(frame, "RGBA")
            d.rectangle((0, 0, W * (global_frame / max(1, total_frames - 1)), 5), fill=GOLD)
            fade_in = min(1, local / (FPS * .35))
            fade_out = min(1, (frames - 1 - local) / (FPS * .35))
            alpha = round((1 - min(fade_in, fade_out)) * 170)
            if alpha > 0:
                d.rectangle((0, 0, W, H), fill=(0, 0, 0, alpha))
            proc.stdin.write(frame.convert("RGB").tobytes())
            global_frame += 1
        print(prefix, "rendered scene", si + 1, "/", len(scenes), flush=True)
    proc.stdin.close()
    code = proc.wait()
    if code:
        raise RuntimeError(f"ffmpeg exited {code}")
    (WORK / f"{prefix}-timing.json").write_text(json.dumps({"total": total, "starts": starts, "durations": durations}, ensure_ascii=False, indent=2), encoding="utf-8")


def contact_sheet(scenes, prefix):
    thumbs = []
    for i, scene in enumerate(scenes):
        img = scene_frames(scene)[-1].resize((480, 270), Image.Resampling.LANCZOS)
        thumbs.append(img)
    sheet = Image.new("RGB", (960, 270 * math.ceil(len(thumbs) / 2)), rgb(BG))
    for i, img in enumerate(thumbs):
        sheet.paste(img, ((i % 2) * 480, (i // 2) * 270))
    sheet.save(WORK / f"{prefix}-contact.jpg", quality=90)


def main():
    import sys
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("video1", "all"):
        render_video(VIDEO1, "video1", OUT / "01_灵魂回响_项目纪实与规则介绍.mp4", "01_项目纪实_封面.png")
        contact_sheet(VIDEO1, "video1")
    if which in ("video2", "all"):
        render_video(VIDEO2, "video2x", OUT / "02_灵魂回响_高质量对局解说.mp4", "02_对局解说_封面.png")
        contact_sheet(VIDEO2, "video2x")
    if which in ("video3", "all"):
        render_video(VIDEO3, "video3", OUT / "03_灵魂回响_标准对局解说.mp4", "03_对局解说_封面.png")
        contact_sheet(VIDEO3, "video3")


if __name__ == "__main__":
    main()

"""从项目唯一的 Python 牌表生成引擎数据；不执行工作簿构建代码。"""
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "build_soul_echo_playtest.py"
OUT = Path(__file__).resolve().parents[1] / "js" / "engine"


def literal_call(node: ast.Call) -> dict:
    values = [ast.literal_eval(a) for a in node.args]
    fields = ("name", "type", "color", "total", "colored", "grey", "attack", "impact", "vitality", "keywords", "effect", "trigger", "note")
    result = dict(zip(fields, values))
    for field, default in {"attack": "—", "impact": "—", "vitality": "—", "keywords": "", "effect": "", "trigger": "—", "note": ""}.items():
        result.setdefault(field, default)
    result.update({kw.arg: ast.literal_eval(kw.value) for kw in node.keywords})
    return result


def main() -> None:
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"), filename=str(SOURCE))
    cards: list[dict] = []
    decks: dict[str, dict[str, int]] = {}
    spirits: dict[str, str] = {}
    goals: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name == "CARDS" and isinstance(node.value, ast.List):
                cards = [literal_call(x) for x in node.value.elts if isinstance(x, ast.Call)]
            elif name in {"DECKS", "SPIRITS", "DECK_GOALS"}:
                if name == "DECKS" and isinstance(node.value, ast.Dict):
                    decks = {}
                    for key, value_node in zip(node.value.keys, node.value.values):
                        deck_name = ast.literal_eval(key)
                        if isinstance(value_node, ast.DictComp):
                            names = ast.literal_eval(value_node.generators[0].iter)
                            decks[deck_name] = {card_name: 4 for card_name in names}
                        else:
                            decks[deck_name] = ast.literal_eval(value_node)
                    continue
                value = ast.literal_eval(node.value)
                if name == "SPIRITS":
                    spirits = value
                else:
                    goals = value
    assert len(cards) == 53, f"预期 53 种卡，实际 {len(cards)}"
    assert len(decks) == 6 and all(sum(d.values()) == 40 for d in decks.values())

    rows = []
    for index, c in enumerate(cards, 1):
        numeric = lambda value: value if isinstance(value, int) else None
        rows.append({
            "id": f"se{index:03d}", "name": c["name"], "type": c["type"], "color": c["color"],
            "cost": {"total": c["total"], "colored": c["colored"], "grey": c["grey"]},
            "attack": numeric(c["attack"]), "impact": numeric(c["impact"]), "vitality": numeric(c["vitality"]),
            "keywords": c["keywords"].split("、") if c["keywords"] else [],
            "text": c["effect"], "trigger": c["trigger"], "note": c["note"],
        })
    card_js = "// 由 tools/sync_cards.py 生成；请勿手抄修改。\nexport const CARD_DATA = " + json.dumps(rows, ensure_ascii=False, indent=2) + ";\n\n"
    card_js += "export const BY_NAME = new Map(CARD_DATA.map((c) => [c.name, c]));\n"
    card_js += "export const BY_ID = new Map(CARD_DATA.map((c) => [c.id, c]));\n"
    precon_js = "// 由 tools/sync_cards.py 生成；每套 40 张。\nexport const PRECONS = " + json.dumps(decks, ensure_ascii=False, indent=2) + ";\n\n"
    precon_js += "export const SPIRITS = " + json.dumps(spirits, ensure_ascii=False, indent=2) + ";\n\n"
    precon_js += "export const DECK_GOALS = " + json.dumps(goals, ensure_ascii=False, indent=2) + ";\n"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "cards.js").write_text(card_js, encoding="utf-8")
    (OUT / "precons.js").write_text(precon_js, encoding="utf-8")
    print(f"同步 {len(rows)} 种卡、{len(decks)} 套预组 → {OUT}")


if __name__ == "__main__":
    main()

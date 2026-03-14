import json
import os

def get_keys(data, prefix=''):
    """JSONの全キーをドット区切りのフルパスで取得する"""
    keys = set()
    for k, v in data.items():
        keypath = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(get_keys(v, keypath))
        else:
            keys.add(keypath)
    return keys

def compare_i18n(file_base, file_target):
    with open(file_base, 'r', encoding='utf-8') as f:
        base_data = json.load(f)
    with open(file_target, 'r', encoding='utf-8') as f:
        target_data = json.load(f)

    base_keys = get_keys(base_data)
    target_keys = get_keys(target_data)

    missing = base_keys - target_keys
    extra = target_keys - base_keys

    print(f"--- {file_target} の確認結果 ---")
    if missing:
        print(f"不足しているキー ({len(missing)}個):")
        for k in sorted(missing): print(f"  - {k}")
    else:
        print("不足キーはありません。")

    if extra:
        print(f"ベースにない余分なキー ({len(extra)}個):")
        for k in sorted(extra): print(f"  - {k}")
    print("\n")

# 実行例
compare_i18n('ja.json', 'en.json')
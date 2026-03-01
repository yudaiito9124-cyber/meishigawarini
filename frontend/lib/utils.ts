/**
 * ファイル概要: tailwind-merge と clsx を利用したユーティリティ関数
 * 目的: コンポーネントのクラス名を動的に結合・競合解消するための `cn` 関数を提供します。
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const xaml = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml", import.meta.url), "utf8");
const code = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml.cs", import.meta.url), "utf8");

test("panel glass uses a light translucent palette instead of stacked opaque dark fills", () => {
  assert.match(xaml, /x:Key="TextMain" Color="#FF18282D"/);
  assert.match(xaml, /x:Key="TextSoft" Color="#FF52666B"/);
  assert.match(xaml, /<Border x:Name="WindowShell"[^>]*Background="#BFEAF4F1"/s);
  assert.match(xaml, /<Border CornerRadius="31" Background="#38EAF6F2"/);
  assert.match(xaml, /<Border Background="#EDF5F9F7"[^>]*MinWidth="180"/);
  assert.match(code, /GradientColor = unchecked\(\(int\)0x80F5EFE7\)/);
});
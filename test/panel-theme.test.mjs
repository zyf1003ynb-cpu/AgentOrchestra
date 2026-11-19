import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const xaml = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml", import.meta.url), "utf8");
const code = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml.cs", import.meta.url), "utf8");

test("panel glass uses a light translucent palette instead of stacked opaque dark fills", () => {
  assert.match(xaml, /x:Key="TextMain" Color="#FF18282D"/);
  assert.match(xaml, /x:Key="TextSoft" Color="#FF52666B"/);
  assert.match(xaml, /<Border x:Name="WindowShell"[^>]*Background="Transparent"/s);
  assert.match(xaml, /<Border CornerRadius="31">\s*<Border\.Background>\s*<LinearGradientBrush/s);
  assert.match(xaml, /<Border Background="#EDF5F9F7"[^>]*MinWidth="180"/);
  assert.doesNotMatch(code, /EnableAcrylicBackdrop|SetWindowCompositionAttribute|DllImport|StructLayout/);
});
test("fixed assignment checkbox references a defined glass checkbox style", () => {
  assert.match(xaml, /<Style x:Key="GlassCheckBox" TargetType="CheckBox">/);
  assert.match(xaml, /<Trigger Property="IsChecked" Value="True">[\s\S]*?<Setter TargetName="CheckMark" Property="Visibility" Value="Visible"\s*\/>/);
});
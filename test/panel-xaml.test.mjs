import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const xaml = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml", import.meta.url), "utf8");
const code = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml.cs", import.meta.url), "utf8");

test("the compact island keeps a visible expand control and a separate close control", () => {
  assert.match(xaml, /ColumnDefinition Width="32" \/>\s*<ColumnDefinition Width="32" \/>/);
  assert.match(xaml, /<Button x:Name="CollapseButton"[^>]*Click="CollapseButton_Click"/);
  assert.match(xaml, /<Button x:Name="CloseButton"[^>]*Click="CloseButton_Click"/);
  assert.match(code, /private void SetExpanded\(bool expanded\)[\s\S]*?CollapseButton\.Visibility = Visibility\.Visible/);
  assert.match(code, /private void SetExpanded\(bool expanded\)[\s\S]*?CloseButton\.Visibility = expanded \? Visibility\.Visible : Visibility\.Collapsed/);
});

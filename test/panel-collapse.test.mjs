import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const xaml = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml", import.meta.url), "utf8");
const code = await readFile(new URL("../desktop/TeamModeControl/MainWindow.xaml.cs", import.meta.url), "utf8");

test("the compact island keeps a visible expand control and a separate close control", () => {
  assert.equal((xaml.match(/<ColumnDefinition Width="32" \/>/g) ?? []).length, 2, "header reserves a separate slot for expand and close");
  assert.match(xaml, /<Button x:Name="CollapseButton"[^>]*Click="CollapseButton_Click"/);
  assert.match(xaml, /<Button x:Name="CloseButton"[^>]*Click="CloseButton_Click"/);
  const setExpanded = code.match(/private void SetExpanded\(bool expanded\)[\s\S]*?\n    }/)?.[0] ?? "";
  assert.match(setExpanded, /CollapseButton\.Visibility = Visibility\.Visible/);
  assert.match(setExpanded, /CloseButton\.Visibility = expanded \? Visibility\.Visible : Visibility\.Collapsed/);
});

test("interactive header buttons do not start window dragging", () => {
  const dragHandler = code.match(/private void Header_MouseLeftButtonDown\([\s\S]*?\n    }/)?.[0] ?? "";
  assert.match(dragHandler, /IsInsideButton\(e\.OriginalSource as DependencyObject\)/);
  assert.match(dragHandler, /DragMove\(\)/);
  assert.match(code, /private static bool IsInsideButton\(DependencyObject\? element\)/);
});

#!/usr/bin/env python3
"""Verify sandtable panel by connecting to running Electron via CDP."""
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

def main():
    # Start Electron with remote debugging
    print('Starting Electron with remote debugging...')
    proc = subprocess.Popen(
        ['npx', 'electron', '.', '--remote-debugging-port=9223'],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(6)

    try:
        with sync_playwright() as p:
            print('Connecting to CDP...')
            browser = p.chromium.connect_over_cdp('http://127.0.0.1:9223')
            context = browser.contexts[0]
            page = context.pages[0]
            page.set_viewport_size({'width': 1280, 'height': 800})
            page.wait_for_load_state('networkidle')
            time.sleep(2)

            title = page.title()
            print(f'Page title: {title}')
            assert '安多县卫星图' in title, f'Unexpected title: {title}'

            # Capture console errors
            errors = []
            page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)

            # Click 沙盘 tab
            print('Clicking 沙盘 tab...')
            page.click('button.sb-tab[data-tab="sandtable"]')
            time.sleep(1)

            panel_text = page.inner_text('#tab-sandtable', timeout=5000)
            print('Panel text preview:', panel_text[:200])
            assert '沙盘制作图层' in panel_text
            assert '乡镇驻地' in panel_text

            # Click load data
            print('Clicking load data button...')
            page.click('button#btn-sandtable-load')
            time.sleep(2)
            btn_text = page.inner_text('button#btn-sandtable-load', timeout=5000)
            print(f'Button text: {btn_text}')
            assert '已加载' in btn_text

            # Toggle village layer
            print('Toggling village layer...')
            page.click('label[data-cat="village"] input[type="checkbox"]')
            time.sleep(0.5)
            page.click('label[data-cat="village"] input[type="checkbox"]')
            time.sleep(0.5)

            if errors:
                print('Console errors:', errors, file=sys.stderr)
                raise AssertionError(f'{len(errors)} console errors observed')

            print('\nVerification PASSED')
            return 0
    except Exception as e:
        print(f'\nVerification FAILED: {e}', file=sys.stderr)
        try:
            page.screenshot(path=str(ROOT / 'data' / 'sandtable-geojson' / 'verify-screenshot.png'))
        except Exception:
            pass
        return 1
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

if __name__ == '__main__':
    sys.exit(main())

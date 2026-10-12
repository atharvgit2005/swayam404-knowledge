import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var window: NSWindow?
    var webView: WKWebView?
    let appUrl = URL(string: "http://127.0.0.1:52410")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 1. Regular app policy so it has a window and dock icon
        NSApp.setActivationPolicy(.regular)

        // 2. Setup macOS Menu Bar / System Tray Item
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.title = "⚡ Swayam404"
            button.toolTip = "Swayam404 Desktop Installer & Updater"
        }

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "🚀 Open Dashboard Window", action: #selector(showWindow), keyEquivalent: "o"))
        menu.addItem(NSMenuItem(title: "🌐 Open in Web Browser", action: #selector(openInBrowser), keyEquivalent: "b"))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "🔄 Reload Dashboard", action: #selector(reloadWebView), keyEquivalent: "r"))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "🚪 Quit Swayam404", action: #selector(quitApp), keyEquivalent: "q"))

        statusItem.menu = menu

        // 3. Create and show the standalone window on launch
        createAndShowWindow()
    }

    func createAndShowWindow() {
        if window == nil {
            let rect = NSRect(x: 0, y: 0, width: 960, height: 740)
            let win = NSWindow(
                contentRect: rect,
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            win.center()
            win.title = "Swayam404 — Desktop Installer & Updater"
            win.minSize = NSSize(width: 600, height: 500)

            let webViewConfig = WKWebViewConfiguration()
            let wv = WKWebView(frame: rect, configuration: webViewConfig)
            wv.autoresizingMask = [.width, .height]
            wv.load(URLRequest(url: appUrl))

            win.contentView = wv
            self.webView = wv
            self.window = win
        }

        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc func showWindow() {
        createAndShowWindow()
    }

    @objc func openInBrowser() {
        NSWorkspace.shared.open(appUrl)
    }

    @objc func reloadWebView() {
        webView?.reload()
    }

    @objc func quitApp() {
        NSApp.terminate(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        // Keep running in system tray even if window is closed!
        return false
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()

import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var statusItem: NSStatusItem!
    var window: NSWindow?
    var webView: WKWebView?
    var serverProcess: Process?
    let appUrl = URL(string: "http://127.0.0.1:52410")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 1. Regular app policy so it has a window and dock icon
        NSApp.setActivationPolicy(.regular)

        // 2. Start bundled backend server
        startBackendServer()

        // 3. Setup macOS Menu Bar / System Tray Item
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

        // 4. Create and show window
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            self.createAndShowWindow()
        }
    }

    func startBackendServer() {
        let bundlePath = Bundle.main.bundlePath
        let resourcesApp = URL(fileURLWithPath: bundlePath).appendingPathComponent("Contents/Resources/app").path
        let fileManager = FileManager.default
        let appDir: String
        if fileManager.fileExists(atPath: resourcesApp) {
            appDir = resourcesApp
        } else {
            appDir = URL(fileURLWithPath: bundlePath).deletingLastPathComponent().path
        }

        let proc = Process()
        proc.currentDirectoryURL = URL(fileURLWithPath: appDir)
        proc.executableURL = URL(fileURLWithPath: "/bin/bash")
        proc.arguments = [
            "-c",
            "export PATH=\"/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH\"; node server.mjs"
        ]

        do {
            try proc.run()
            self.serverProcess = proc
        } catch {
            print("Note: Backend start failed:", error)
        }
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
            wv.navigationDelegate = self
            wv.load(URLRequest(url: appUrl))

            win.contentView = wv
            self.webView = wv
            self.window = win
        }

        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        // Server might still be booting, retry in 0.4s
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            webView.load(URLRequest(url: self.appUrl))
        }
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
        serverProcess?.terminate()
        NSApp.terminate(nil)
    }

    func applicationWillTerminate(_ notification: Notification) {
        serverProcess?.terminate()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()

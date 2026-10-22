import Cocoa

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("Usage: generate-icon <output.iconset>\n", stderr)
    exit(1)
}

let iconsetPath = args[1]
let fm = FileManager.default
try? fm.removeItem(atPath: iconsetPath)
try fm.createDirectory(atPath: iconsetPath, withIntermediateDirectories: true)

func drawIcon(size: Int) -> NSImage {
    let s = CGFloat(size)
    let image = NSImage(size: NSSize(width: s, height: s))
    image.lockFocus()

    guard let ctx = NSGraphicsContext.current?.cgContext else {
        image.unlockFocus()
        return image
    }

    ctx.setAllowsAntialiasing(true)
    ctx.setShouldAntialias(true)

    let pad = s * 0.08
    let rect = CGRect(x: pad, y: pad, width: s - pad * 2, height: s - pad * 2)
    let radius = rect.width * 0.225
    let bgPath = CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil)

    // Outer shadow
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -s * 0.02), blur: s * 0.045, color: NSColor(calibratedWhite: 0, alpha: 0.45).cgColor)
    ctx.addPath(bgPath)
    ctx.setFillColor(NSColor(calibratedRed: 0.11, green: 0.085, blue: 0.068, alpha: 1.0).cgColor)
    ctx.fillPath()
    ctx.restoreGState()

    // Clip to squircle
    ctx.saveGState()
    ctx.addPath(bgPath)
    ctx.clip()

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bgColors = [
        CGColor(red: 0.20, green: 0.14, blue: 0.10, alpha: 1.0),
        CGColor(red: 0.09, green: 0.07, blue: 0.055, alpha: 1.0)
    ] as CFArray
    if let grad = CGGradient(colorsSpace: colorSpace, colors: bgColors, locations: [0.0, 1.0]) {
        ctx.drawLinearGradient(
            grad,
            start: CGPoint(x: s * 0.25, y: s * 0.92),
            end: CGPoint(x: s * 0.75, y: s * 0.08),
            options: []
        )
    }

    // Warm copper radial glow at top
    let glowColors = [
        CGColor(red: 0.94, green: 0.61, blue: 0.39, alpha: 0.36),
        CGColor(red: 0.94, green: 0.61, blue: 0.39, alpha: 0.0)
    ] as CFArray
    if let glow = CGGradient(colorsSpace: colorSpace, colors: glowColors, locations: [0.0, 1.0]) {
        ctx.drawRadialGradient(
            glow,
            startCenter: CGPoint(x: s * 0.34, y: s * 0.78),
            startRadius: 0,
            endCenter: CGPoint(x: s * 0.34, y: s * 0.78),
            endRadius: s * 0.52,
            options: []
        )
    }

    // Gold coin ring
    let center = CGPoint(x: s * 0.5, y: s * 0.52)
    let ringR = s * 0.27
    ctx.setStrokeColor(CGColor(red: 0.94, green: 0.67, blue: 0.42, alpha: 0.26))
    ctx.setLineWidth(s * 0.032)
    ctx.addArc(center: center, radius: ringR, startAngle: 0, endAngle: .pi * 2, clockwise: false)
    ctx.strokePath()

    // Active progress arc on the ring
    ctx.setStrokeColor(CGColor(red: 0.94, green: 0.62, blue: 0.38, alpha: 0.95))
    ctx.setLineWidth(s * 0.036)
    ctx.setLineCap(.round)
    ctx.addArc(center: center, radius: ringR, startAngle: .pi * 0.65, endAngle: -.pi * 0.18, clockwise: true)
    ctx.strokePath()

    // Draw "¥" symbol in the center
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    let fontSize = s * 0.34
    let font = NSFont(name: "Georgia-Bold", size: fontSize) ?? NSFont.boldSystemFont(ofSize: fontSize)
    let attrs: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor(calibratedRed: 0.98, green: 0.94, blue: 0.89, alpha: 1.0),
        .paragraphStyle: paragraph
    ]
    let str = NSAttributedString(string: "¥", attributes: attrs)
    let strSize = str.size()
    let strRect = CGRect(
        x: (s - strSize.width) / 2,
        y: center.y - strSize.height * 0.52,
        width: strSize.width,
        height: strSize.height
    )
    str.draw(in: strRect)

    // Bottom progress pill bar
    let pillW = s * 0.38
    let pillH = s * 0.042
    let pillRect = CGRect(x: (s - pillW) / 2, y: s * 0.16, width: pillW, height: pillH)
    let pillPath = CGPath(roundedRect: pillRect, cornerWidth: pillH / 2, cornerHeight: pillH / 2, transform: nil)
    ctx.addPath(pillPath)
    ctx.setFillColor(CGColor(red: 0.95, green: 0.76, blue: 0.49, alpha: 0.88))
    ctx.fillPath()

    ctx.restoreGState()

    // Subtle inner border
    ctx.addPath(bgPath)
    ctx.setStrokeColor(CGColor(red: 0.96, green: 0.78, blue: 0.56, alpha: 0.28))
    ctx.setLineWidth(max(1.0, s * 0.012))
    ctx.strokePath()

    image.unlockFocus()
    return image
}

func writePNG(_ image: NSImage, to path: String, pixelSize: Int) throws {
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: pixelSize,
        pixelsHigh: pixelSize,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else { return }

    rep.size = NSSize(width: pixelSize, height: pixelSize)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    image.draw(in: NSRect(x: 0, y: 0, width: pixelSize, height: pixelSize))
    NSGraphicsContext.restoreGraphicsState()

    if let png = rep.representation(using: .png, properties: [:]) {
        try png.write(to: URL(fileURLWithPath: path))
    }
}

let specs: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

for (filename, px) in specs {
    let img = drawIcon(size: px)
    try writePNG(img, to: "\(iconsetPath)/\(filename)", pixelSize: px)
}

import AVFoundation
import CoreGraphics
import CoreVideo
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let outputPath = CommandLine.arguments.dropFirst().first ?? "data/synthetic_ball.mp4"
let outputURL = root.appendingPathComponent(outputPath)
try? FileManager.default.removeItem(at: outputURL)

let width = 640
let height = 360
let fps: Int32 = 30
let frameCount = 72

let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: 650_000,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264BaselineAutoLevel
  ]
])
input.expectsMediaDataInRealTime = false

let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: input,
  sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height
  ]
)

guard writer.canAdd(input) else {
  fatalError("cannot add video input")
}
writer.add(input)
guard writer.startWriting() else {
  fatalError(writer.error?.localizedDescription ?? "failed to start writer")
}
writer.startSession(atSourceTime: .zero)

let queue = DispatchQueue(label: "synthetic-ball-writer")
let group = DispatchGroup()
group.enter()
var frameIndex = 0

input.requestMediaDataWhenReady(on: queue) {
  while input.isReadyForMoreMediaData && frameIndex < frameCount {
    guard let buffer = makeFrame(index: frameIndex, total: frameCount, width: width, height: height) else {
      fatalError("failed to create pixel buffer")
    }
    let time = CMTime(value: CMTimeValue(frameIndex), timescale: fps)
    if !adaptor.append(buffer, withPresentationTime: time) {
      fatalError(writer.error?.localizedDescription ?? "failed to append frame")
    }
    frameIndex += 1
  }
  if frameIndex >= frameCount {
    input.markAsFinished()
    writer.finishWriting {
      if writer.status != .completed {
        fatalError(writer.error?.localizedDescription ?? "failed to finish writer")
      }
      group.leave()
    }
  }
}

group.wait()

func makeFrame(index: Int, total: Int, width: Int, height: Int) -> CVPixelBuffer? {
  var pixelBuffer: CVPixelBuffer?
  let status = CVPixelBufferCreate(
    kCFAllocatorDefault,
    width,
    height,
    kCVPixelFormatType_32ARGB,
    nil,
    &pixelBuffer
  )
  guard status == kCVReturnSuccess, let buffer = pixelBuffer else { return nil }

  CVPixelBufferLockBaseAddress(buffer, [])
  defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

  guard let context = CGContext(
    data: CVPixelBufferGetBaseAddress(buffer),
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
  ) else {
    return nil
  }

  drawScene(context: context, index: index, total: total, width: CGFloat(width), height: CGFloat(height))
  return buffer
}

@Sendable func drawScene(context: CGContext, index: Int, total: Int, width: CGFloat, height: CGFloat) {
  let t = CGFloat(index) / CGFloat(max(1, total - 1))
  context.setFillColor(CGColor(red: 0.03, green: 0.05, blue: 0.06, alpha: 1))
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))

  context.setStrokeColor(CGColor(red: 0.22, green: 0.65, blue: 0.82, alpha: 0.8))
  context.setLineWidth(3)
  context.stroke(CGRect(x: 54, y: 42, width: width - 108, height: height - 84))
  context.move(to: CGPoint(x: width * 0.18, y: height * 0.5))
  context.addLine(to: CGPoint(x: width * 0.82, y: height * 0.5))
  context.strokePath()

  let rim = CGPoint(x: width * 0.78, y: height * 0.34)
  context.setStrokeColor(CGColor(red: 0.94, green: 0.28, blue: 0.18, alpha: 1))
  context.setLineWidth(5)
  context.strokeEllipse(in: CGRect(x: rim.x - 30, y: rim.y - 7, width: 60, height: 14))
  context.setStrokeColor(CGColor(red: 0.95, green: 0.95, blue: 0.95, alpha: 0.6))
  context.setLineWidth(2)
  context.stroke(CGRect(x: rim.x + 22, y: rim.y - 50, width: 74, height: 58))

  let start = CGPoint(x: width * 0.18, y: height * 0.72)
  let control = CGPoint(x: width * 0.48, y: height * 0.12)
  let end = CGPoint(x: width * 0.78, y: height * 0.34)
  let oneMinus = 1 - t
  let ball = CGPoint(
    x: oneMinus * oneMinus * start.x + 2 * oneMinus * t * control.x + t * t * end.x,
    y: oneMinus * oneMinus * start.y + 2 * oneMinus * t * control.y + t * t * end.y
  )

  context.setStrokeColor(CGColor(red: 1, green: 0.72, blue: 0.28, alpha: 0.28))
  context.setLineWidth(2)
  var previous = start
  for step in 1...24 {
    let localT = CGFloat(step) / 24
    let localOneMinus = 1 - localT
    let point = CGPoint(
      x: localOneMinus * localOneMinus * start.x + 2 * localOneMinus * localT * control.x + localT * localT * end.x,
      y: localOneMinus * localOneMinus * start.y + 2 * localOneMinus * localT * control.y + localT * localT * end.y
    )
    context.move(to: previous)
    context.addLine(to: point)
    previous = point
  }
  context.strokePath()

  context.setFillColor(CGColor(red: 1, green: 0.47, blue: 0.12, alpha: 1))
  context.fillEllipse(in: CGRect(x: ball.x - 13, y: ball.y - 13, width: 26, height: 26))
  context.setStrokeColor(CGColor(red: 0.36, green: 0.14, blue: 0.05, alpha: 0.85))
  context.setLineWidth(2)
  context.strokeEllipse(in: CGRect(x: ball.x - 13, y: ball.y - 13, width: 26, height: 26))

  context.setStrokeColor(CGColor(red: 0.9, green: 0.96, blue: 1, alpha: 0.28))
  context.setLineWidth(2)
  context.stroke(CGRect(x: 18, y: height - 44, width: 240, height: 22))
}

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#09090b",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 82,
            fontFamily: "Georgia, serif",
            color: "#f4f1ea",
            letterSpacing: "-0.06em",
            lineHeight: 1,
          }}
        >
          MC
        </div>
        <div
          style={{
            marginTop: 10,
            width: 34,
            height: 4,
            background: "#34d399",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
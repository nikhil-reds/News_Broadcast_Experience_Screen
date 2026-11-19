import argparse
import torch


def main():
    parser = argparse.ArgumentParser(description="Warm the local Robust Video Matting model cache.")
    parser.add_argument("--model", default="mobilenetv3", choices=["mobilenetv3", "resnet50"])
    args = parser.parse_args()

    model_name = "resnet50" if args.model == "resnet50" else "mobilenetv3"
    torch.hub.load(
        "PeterL1n/RobustVideoMatting",
        model_name,
        pretrained=True,
        trust_repo=True,
    )
    print(f"RVM {model_name} is available in the torch hub cache.")


if __name__ == "__main__":
    main()

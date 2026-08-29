import uvicorn
from backend import main

if __name__ == "__main__":
    # 仅绑定本机回环地址，避免开发后端暴露到局域网。
    uvicorn.run(main.app, host="127.0.0.1", port=8300)

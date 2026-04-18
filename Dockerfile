FROM node:24-slim

# Crea el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de configuración de dependencias
COPY package*.json ./

# Instala herramientas de compilación para dependencias nativas (raknet-native, better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ cmake && rm -rf /var/lib/apt/lists/*

# Instala las dependencias. 
# Nota: node:24-slim es ideal para better-sqlite3 porque ya incluye soporte glibc.
RUN npm install

# Copia el resto de los archivos del proyecto al contenedor
COPY . .

# Expone los puertos necesarios:
# 53 UDP   -> Servidor DNS para interceptar llamadas de consola
# 19132 UDP -> Servidor Proxy de Minecraft Bedrock
# 3000 TCP  -> API REST para administrar la base de datos
EXPOSE 53/udp
EXPOSE 19132/udp
EXPOSE 3000/tcp

# Ejecuta el proyecto al iniciar el contenedor
CMD ["node", "index.js"]

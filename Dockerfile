# Utilizo una imagen base de Redis
FROM redis:latest

# Expongo el puerto en el que Redis escucha
EXPOSE 6379

# Comando para ejecutar Redis 
CMD ["redis-server"]

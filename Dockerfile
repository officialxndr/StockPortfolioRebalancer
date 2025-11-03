# Use an official Nginx image as the base
FROM nginx:stable-alpine

# Copy your application's static files to the Nginx server's root directory
COPY . /usr/share/nginx/html

# Expose port 80 to allow traffic to the Nginx server
EXPOSE 80

# The default command for the Nginx image is to start the server,
# so we don't need to add a CMD instruction.

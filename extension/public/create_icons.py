from PIL import Image

def create_icon(size, filename):
    color = (0, 128, 128)
    img = Image.new('RGB', (size, size), color)
    img.save(filename, 'PNG')
    print(f"Created {filename}")

public_folder = 'c:/Users/MINKU SANTRA/Desktop/MemoryOS/extension/public'

create_icon(16, f'{public_folder}/icon16.png')
create_icon(32, f'{public_folder}/icon32.png')
create_icon(48, f'{public_folder}/icon48.png')
create_icon(128, f'{public_folder}/icon128.png')

print("\nAll icons created successfully!")
